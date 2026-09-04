add_executable(
  obs-3dgs-native-tests
  native-tests.cpp
  "${PROJECT_SOURCE_DIR}/plugin/asset-validation.cpp"
  "${PROJECT_SOURCE_DIR}/plugin/property-ui.cpp"
  "${PROJECT_SOURCE_DIR}/plugin/settings-snapshot.cpp"
)
target_include_directories(obs-3dgs-native-tests PRIVATE "${PROJECT_SOURCE_DIR}/plugin")
target_compile_features(obs-3dgs-native-tests PRIVATE cxx_std_20)
target_compile_definitions(obs-3dgs-native-tests PRIVATE OBS_3DGS_SOURCE_DIR="${PROJECT_SOURCE_DIR}")
target_link_libraries(obs-3dgs-native-tests PRIVATE OBS::libobs)
add_test(NAME obs-3dgs-native-tests COMMAND obs-3dgs-native-tests)
add_test(NAME obs-3dgs-dependency-config-tests
  COMMAND "${CMAKE_COMMAND}" "-DSOURCE_ROOT=${PROJECT_SOURCE_DIR}" -P "${CMAKE_CURRENT_SOURCE_DIR}/dependency-config-tests.cmake")

add_executable(obs-3dgs-dock-tests dock-tests.cpp)
target_include_directories(obs-3dgs-dock-tests PRIVATE "${PROJECT_SOURCE_DIR}/plugin")
target_compile_features(obs-3dgs-dock-tests PRIVATE cxx_std_20)
target_link_libraries(obs-3dgs-dock-tests PRIVATE Qt6::Widgets nlohmann_json::nlohmann_json)
add_test(NAME obs-3dgs-dock-tests COMMAND obs-3dgs-dock-tests -platform minimal)
foreach(_prefix IN LISTS CMAKE_PREFIX_PATH)
  if(EXISTS "${_prefix}/plugins/platforms")
    set_tests_properties(obs-3dgs-dock-tests PROPERTIES
      ENVIRONMENT "QT_QPA_PLATFORM_PLUGIN_PATH=${_prefix}/plugins/platforms")
  endif()
endforeach()

if(OS_WINDOWS)
  set(_obs_3dgs_test_runtime_paths "PATH=path_list_prepend:$<TARGET_FILE_DIR:OBS::libobs>")
  foreach(_prefix IN LISTS CMAKE_PREFIX_PATH)
    if(EXISTS "${_prefix}/bin/avformat-62.dll")
      list(APPEND _obs_3dgs_test_runtime_paths "PATH=path_list_prepend:${_prefix}/bin")
    endif()
  endforeach()
  set_tests_properties(
    obs-3dgs-native-tests
    PROPERTIES ENVIRONMENT_MODIFICATION "${_obs_3dgs_test_runtime_paths}"
  )
  set_tests_properties(obs-3dgs-dock-tests PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:$<TARGET_FILE_DIR:Qt6::Core>")
elseif(OS_MACOS)
  # Test executables run outside OBS.app, so its ../Frameworks runpath is absent.
  # Supply SDK lookup paths to CTest only; never embed build paths in the plugin.
  set(_obs_3dgs_test_runtime_paths
    "DYLD_FRAMEWORK_PATH=path_list_prepend:${PROJECT_SOURCE_DIR}/.deps/Frameworks"
    "DYLD_LIBRARY_PATH=path_list_prepend:${PROJECT_SOURCE_DIR}/.deps/lib")
  foreach(_prefix IN LISTS CMAKE_PREFIX_PATH)
    if(EXISTS "${_prefix}/lib")
      list(APPEND _obs_3dgs_test_runtime_paths
        "DYLD_FRAMEWORK_PATH=path_list_prepend:${_prefix}/lib"
        "DYLD_LIBRARY_PATH=path_list_prepend:${_prefix}/lib")
    endif()
  endforeach()
  set_tests_properties(obs-3dgs-native-tests obs-3dgs-dock-tests PROPERTIES
    ENVIRONMENT_MODIFICATION "${_obs_3dgs_test_runtime_paths}")
endif()
