use std::{
  env,
  fs,
  path::{Path, PathBuf},
  thread,
  time::Duration,
};

use tao::{
  dpi::LogicalSize,
  event::{Event, WindowEvent},
  event_loop::{ControlFlow, EventLoopBuilder},
  window::WindowBuilder,
};
use wry::{
  http::{header::CONTENT_TYPE, Request, Response},
  NewWindowResponse, WebViewBuilder,
};

#[derive(Debug)]
enum UserEvent {
  Capture(String),
  Timeout,
}

#[derive(Clone)]
struct Inputs {
  html: PathBuf,
  bundle: PathBuf,
  pixi: PathBuf,
  png: PathBuf,
  font: PathBuf,
}

fn main() -> wry::Result<()> {
  let args: Vec<String> = env::args().collect();
  if args.len() != 5 {
    eprintln!("usage: webview2-browser-raster-harness OUTPUT_JSON PIXI_JS PNG FONT_TTF");
    std::process::exit(64);
  }

  let harness_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let inputs = Inputs {
    html: harness_root.join("index.html"),
    bundle: canonical_file("bundle.js"),
    pixi: canonical_file(&args[2]),
    png: canonical_file(&args[3]),
    font: canonical_file(&args[4]),
  };
  let output = PathBuf::from(&args[1]);

  let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
  let window = WindowBuilder::new()
    .with_title("Garupa WebView2 browser raster evidence harness")
    .with_inner_size(LogicalSize::new(320.0, 240.0))
    .with_visible(false)
    .build(&event_loop)
    .expect("create isolated evidence window");

  let proxy = event_loop.create_proxy();
  let ipc_proxy = proxy.clone();
  let protocol_inputs = inputs.clone();
  let builder = WebViewBuilder::new()
    .with_custom_protocol("garupa".into(), move |_webview_id, request| {
      protocol_response(&protocol_inputs, request)
    })
    .with_url("garupa://localhost/")
    .with_devtools(false)
    .with_incognito(true)
    .with_new_window_req_handler(|_, _| NewWindowResponse::Deny)
    .with_ipc_handler(move |request: Request<String>| {
      let _ = ipc_proxy.send_event(UserEvent::Capture(request.body().clone()));
    });

  let webview = builder.build(&window)?;
  let timeout_proxy = proxy.clone();
  thread::spawn(move || {
    thread::sleep(Duration::from_secs(90));
    let _ = timeout_proxy.send_event(UserEvent::Timeout);
  });

  let mut webview = Some(webview);
  event_loop.run(move |event, _, control_flow| {
    *control_flow = ControlFlow::Wait;
    match event {
      Event::UserEvent(UserEvent::Capture(payload)) => {
        let write_result = fs::write(&output, payload.as_bytes());
        let _ = webview.take();
        match write_result {
          Ok(()) => *control_flow = ControlFlow::ExitWithCode(0),
          Err(error) => {
            eprintln!("cannot write capture {}: {error}", output.display());
            *control_flow = ControlFlow::ExitWithCode(74);
          }
        }
      }
      Event::UserEvent(UserEvent::Timeout) => {
        eprintln!("WebView2 capture timed out after 90 seconds");
        let _ = webview.take();
        *control_flow = ControlFlow::ExitWithCode(70);
      }
      Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
        eprintln!("evidence window closed before capture");
        let _ = webview.take();
        *control_flow = ControlFlow::ExitWithCode(71);
      }
      _ => {}
    }
  });
}

fn canonical_file(value: &str) -> PathBuf {
  let path = fs::canonicalize(value).unwrap_or_else(|error| panic!("cannot resolve {value}: {error}"));
  assert!(path.is_file(), "input is not a file: {}", path.display());
  path
}

fn protocol_response(inputs: &Inputs, request: Request<Vec<u8>>) -> Response<std::borrow::Cow<'static, [u8]>> {
  let (path, content_type): (&Path, &'static str) = match request.uri().path() {
    "/" | "/index.html" => (&inputs.html, "text/html; charset=utf-8"),
    "/pixi.js" => (&inputs.pixi, "text/javascript; charset=utf-8"),
    "/bundle.js" => (&inputs.bundle, "text/javascript; charset=utf-8"),
    "/texture.png" => (&inputs.png, "image/png"),
    "/font.ttf" => (&inputs.font, "font/ttf"),
    _ => {
      return Response::builder()
        .status(404)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(std::borrow::Cow::Borrowed(&b"not found"[..]))
        .expect("build 404 response");
    }
  };

  match fs::read(path) {
    Ok(bytes) => Response::builder()
      .status(200)
      .header(CONTENT_TYPE, content_type)
      .header("Cache-Control", "no-store")
      .body(std::borrow::Cow::Owned(bytes))
      .expect("build protocol response"),
    Err(error) => Response::builder()
      .status(500)
      .header(CONTENT_TYPE, "text/plain; charset=utf-8")
      .body(std::borrow::Cow::Owned(error.to_string().into_bytes()))
      .expect("build error response"),
  }
}
