include_guard(GLOBAL)

function(set_target_properties_plugin target)
  set_target_properties(
    ${target}
    PROPERTIES
      PREFIX ""
      OUTPUT_NAME "obs-3dgs"
      BUNDLE TRUE
      BUNDLE_EXTENSION plugin
      XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "${MACOS_BUNDLEID}"
      XCODE_ATTRIBUTE_CURRENT_PROJECT_VERSION "${PLUGIN_BUILD_NUMBER}"
      XCODE_ATTRIBUTE_MARKETING_VERSION "${PLUGIN_VERSION}"
      XCODE_ATTRIBUTE_GENERATE_INFOPLIST_FILE YES
      XCODE_ATTRIBUTE_INFOPLIST_KEY_CFBundleDisplayName "OBS 3DGS Source"
      XCODE_ATTRIBUTE_INSTALL_PATH "$(USER_LIBRARY_DIR)/Application Support/obs-studio/plugins"
  )

  add_custom_command(
    TARGET ${target}
    POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E make_directory "$<TARGET_BUNDLE_DIR:${target}>/Contents/Resources"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${PROJECT_SOURCE_DIR}/data" "$<TARGET_BUNDLE_DIR:${target}>/Contents/Resources"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${PROJECT_SOURCE_DIR}/dist/web" "$<TARGET_BUNDLE_DIR:${target}>/Contents/Resources/web"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${PROJECT_SOURCE_DIR}/docs" "$<TARGET_BUNDLE_DIR:${target}>/Contents/Resources/docs"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${PROJECT_SOURCE_DIR}/LICENSE" "$<TARGET_BUNDLE_DIR:${target}>/Contents/Resources/licenses/GPL-2.0-or-later.txt"
    COMMAND /usr/bin/codesign --force --deep --sign "${CODESIGN_IDENTITY}" "$<TARGET_BUNDLE_DIR:${target}>"
    VERBATIM
  )

  install(TARGETS ${target} LIBRARY DESTINATION . BUNDLE DESTINATION .)
endfunction()
