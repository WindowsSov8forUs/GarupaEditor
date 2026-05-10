!macro NSIS_HOOK_PREINSTALL
  ; GNU toolchain builds depend on WebView2Loader.dll at runtime.
  ; If present next to the built executable, bundle it into $INSTDIR.
  !searchreplace _wv2_loader_path "${MAINBINARYSRCPATH}" "${MAINBINARYNAME}.exe" "WebView2Loader.dll"
  !if /FileExists "${_wv2_loader_path}"
    File "${_wv2_loader_path}"
  !endif
!macroend
