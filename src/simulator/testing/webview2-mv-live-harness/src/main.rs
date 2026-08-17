use std::{
  env,
  fs,
  path::PathBuf,
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
  mp4: PathBuf,
  webm: PathBuf,
}

fn main() -> wry::Result<()> {
  let args: Vec<String> = env::args().collect();
  if args.len() != 4 {
    eprintln!("usage: garupa-mv-live-webview2-harness OUTPUT_JSON MP4 WEBM");
    std::process::exit(64);
  }
  let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let inputs = Inputs {
    html: canonical_file(root.join("index.html")),
    bundle: canonical_file(root.join("bundle.js")),
    mp4: canonical_file(PathBuf::from(&args[2])),
    webm: canonical_file(PathBuf::from(&args[3])),
  };
  let output = PathBuf::from(&args[1]);
  let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
  let window = WindowBuilder::new()
    .with_title("Garupa MV Live WebView2 evidence harness")
    .with_inner_size(LogicalSize::new(1600.0, 720.0))
    .with_visible(false)
    .build(&event_loop)
    .expect("create isolated MV evidence window");
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
    thread::sleep(Duration::from_secs(120));
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
        eprintln!("MV WebView2 capture timed out after 120 seconds");
        let _ = webview.take();
        *control_flow = ControlFlow::ExitWithCode(70);
      }
      Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
        eprintln!("MV evidence window closed before capture");
        let _ = webview.take();
        *control_flow = ControlFlow::ExitWithCode(71);
      }
      _ => {}
    }
  });
}

fn canonical_file(path: PathBuf) -> PathBuf {
  let value = fs::canonicalize(&path)
    .unwrap_or_else(|error| panic!("cannot resolve {}: {error}", path.display()));
  assert!(value.is_file(), "input is not a file: {}", value.display());
  value
}

fn protocol_response(inputs: &Inputs, request: Request<Vec<u8>>) -> Response<std::borrow::Cow<'static, [u8]>> {
  let (path, content_type): (PathBuf, &'static str) = match request.uri().path() {
    "/" | "/index.html" => (inputs.html.clone(), "text/html; charset=utf-8"),
    "/bundle.js" => (inputs.bundle.clone(), "text/javascript; charset=utf-8"),
    "/assets/mv-probe.mp4" => (inputs.mp4.clone(), "video/mp4"),
    "/assets/mv-probe.webm" => (inputs.webm.clone(), "video/webm"),
    _ => {
      return Response::builder()
        .status(404)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(std::borrow::Cow::Borrowed(&b"not found"[..]))
        .expect("build 404 response");
    }
  };
  match fs::read(&path) {
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
