use std::{
  collections::HashMap,
  env,
  fs,
  path::{Path, PathBuf},
  sync::Arc,
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
struct Resource {
  path: PathBuf,
  content_type: String,
}

#[derive(Clone)]
struct Inputs {
  html: PathBuf,
  bundle: PathBuf,
  resources: Arc<HashMap<String, Resource>>,
}

fn main() -> wry::Result<()> {
  let args: Vec<String> = env::args().collect();
  if args.len() != 3 {
    eprintln!("usage: ordinary-rendering-webview2-harness OUTPUT_JSON INPUT_STAGE");
    std::process::exit(64);
  }
  let harness_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let stage = canonical_dir(&args[2]);
  let inputs = Inputs {
    html: canonical_file(harness_root.join("index.html")),
    bundle: canonical_file(harness_root.join("bundle.js")),
    resources: Arc::new(load_allowlist(&stage)),
  };
  let output = PathBuf::from(&args[1]);

  let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
  let window = WindowBuilder::new()
    .with_title("Garupa ordinary rendering WebView2 acceptance")
    .with_inner_size(LogicalSize::new(1600.0, 720.0))
    .with_visible(false)
    .build(&event_loop)
    .expect("create isolated acceptance window");

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
    thread::sleep(Duration::from_secs(600));
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
        eprintln!("WebView2 ordinary rendering acceptance timed out after 600 seconds");
        let _ = webview.take();
        *control_flow = ControlFlow::ExitWithCode(70);
      }
      Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
        eprintln!("acceptance window closed before capture");
        let _ = webview.take();
        *control_flow = ControlFlow::ExitWithCode(71);
      }
      _ => {}
    }
  });
}

fn load_allowlist(stage: &Path) -> HashMap<String, Resource> {
  let manifest = fs::read_to_string(stage.join("allowlist.txt"))
    .expect("read staged custom-protocol allowlist");
  let mut result = HashMap::new();
  for (line_index, line) in manifest.lines().enumerate() {
    let fields: Vec<&str> = line.split('\t').collect();
    assert!(fields.len() == 3, "invalid allowlist row {}", line_index + 1);
    let route = fields[0];
    let name = fields[1];
    let content_type = fields[2];
    assert!(route.starts_with('/') && !route.contains(".."), "invalid allowlist route");
    assert!(!name.contains('/') && !name.contains('\\') && !name.contains(".."), "invalid allowlist filename");
    assert!(!content_type.is_empty(), "empty allowlist MIME");
    let path = canonical_file(stage.join(name));
    assert!(path.starts_with(stage), "allowlist file escaped staged root");
    assert!(result.insert(route.to_string(), Resource {
      path,
      content_type: content_type.to_string(),
    }).is_none(), "duplicate allowlist route");
  }
  assert!(
    result.len() == 74 || result.len() == 38 || result.len() == 36 || result.len() == 32 || result.len() == 13 || result.len() == 22 || result.len() == 23 || result.len() == 4,
    "rendering allowlist must contain exactly 74/38/36/32 ordinary, 13 original-settings, 22/23 exact-particle selected-Skin, or 4 startup routes"
  );
  result
}

fn canonical_file(value: impl AsRef<Path>) -> PathBuf {
  let display = value.as_ref().display().to_string();
  let path = fs::canonicalize(value).unwrap_or_else(|error| panic!("cannot resolve {display}: {error}"));
  assert!(path.is_file(), "input is not a file: {}", path.display());
  path
}

fn canonical_dir(value: impl AsRef<Path>) -> PathBuf {
  let display = value.as_ref().display().to_string();
  let path = fs::canonicalize(value).unwrap_or_else(|error| panic!("cannot resolve {display}: {error}"));
  assert!(path.is_dir(), "input is not a directory: {}", path.display());
  path
}

fn protocol_response(inputs: &Inputs, request: Request<Vec<u8>>) -> Response<std::borrow::Cow<'static, [u8]>> {
  let route = request.uri().path();
  let fixed = match route {
    "/" | "/index.html" => Some((inputs.html.clone(), "text/html; charset=utf-8".to_string())),
    "/bundle.js" => Some((inputs.bundle.clone(), "text/javascript; charset=utf-8".to_string())),
    _ => None,
  };
  let selected = fixed.or_else(|| inputs.resources.get(route).map(|resource| {
    (resource.path.clone(), resource.content_type.clone())
  }));
  let Some((path, content_type)) = selected else {
    return Response::builder()
      .status(404)
      .header(CONTENT_TYPE, "text/plain; charset=utf-8")
      .body(std::borrow::Cow::Borrowed(&b"not found"[..]))
      .expect("build 404 response");
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
