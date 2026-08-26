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
  pixi: PathBuf,
  png: PathBuf,
  font: PathBuf,
  score_profile: PathBuf,
  score_assets: PathBuf,
  score_animation: PathBuf,
}

fn main() -> wry::Result<()> {
  let args: Vec<String> = env::args().collect();
  if args.len() != 8 {
    eprintln!("usage: webview2-browser-raster-harness OUTPUT_JSON PIXI_JS PNG FONT_TTF SCORE_PROFILE SCORE_ASSET_DIR SCORE_ANIMATION");
    std::process::exit(64);
  }

  let harness_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let inputs = Inputs {
    html: harness_root.join("index.html"),
    bundle: canonical_file("bundle.js"),
    pixi: canonical_file(&args[2]),
    png: canonical_file(&args[3]),
    font: canonical_file(&args[4]),
    score_profile: canonical_file(&args[5]),
    score_assets: canonical_dir(&args[6]),
    score_animation: canonical_file(&args[7]),
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

fn canonical_dir(value: &str) -> PathBuf {
  let path = fs::canonicalize(value).unwrap_or_else(|error| panic!("cannot resolve {value}: {error}"));
  assert!(path.is_dir(), "input is not a directory: {}", path.display());
  path
}

fn protocol_response(inputs: &Inputs, request: Request<Vec<u8>>) -> Response<std::borrow::Cow<'static, [u8]>> {
  let (path, content_type): (PathBuf, &'static str) = match request.uri().path() {
    "/" | "/index.html" => (inputs.html.clone(), "text/html; charset=utf-8"),
    "/pixi.js" => (inputs.pixi.clone(), "text/javascript; charset=utf-8"),
    "/bundle.js" => (inputs.bundle.clone(), "text/javascript; charset=utf-8"),
    "/texture.png" => (inputs.png.clone(), "image/png"),
    "/font.ttf" => (inputs.font.clone(), "font/ttf"),
    "/score-profile.json" => (inputs.score_profile.clone(), "application/json; charset=utf-8"),
    "/score-animation.json" => (inputs.score_animation.clone(), "application/json; charset=utf-8"),
    "/score-assets/rhythm-game-ui.png" => (inputs.score_assets.join("rhythm-game-ui.png"), "image/png"),
    "/score-assets/rank-label-font.ttf" => (inputs.score_assets.join("rank-label-font.ttf"), "font/ttf"),
    "/score-assets/ui-common.png" => (inputs.score_assets.join("ui-common.png"), "image/png"),
    "/score-assets/high-rank-kira.png" => (inputs.score_assets.join("high-rank-kira.png"), "image/png"),
    "/score-assets/high-rank-long-star.png" => (inputs.score_assets.join("high-rank-long-star.png"), "image/png"),
    "/score-assets/high-rank-overlay.png" => (inputs.score_assets.join("high-rank-overlay.png"), "image/png"),
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
