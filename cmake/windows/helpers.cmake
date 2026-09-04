include_guard(GLOBAL)

function(set_target_properties_plugin target)
  set_target_properties(${target} PROPERTIES PREFIX "" OUTPUT_NAME "obs-3dgs")
  target_link_options(
    ${target}
    PRIVATE
      /NODEFAULTLIB:LIBCMT
      $<$<CONFIG:Debug>:/NODEFAULTLIB:LIBCMTD>
  )
  configure_file(
    "${PROJECT_SOURCE_DIR}/cmake/windows/resources/resource.rc.in"
    "${CMAKE_CURRENT_BINARY_DIR}/obs-3dgs.rc"
  )
  target_sources(${target} PRIVATE "${CMAKE_CURRENT_BINARY_DIR}/obs-3dgs.rc")

  install(TARGETS ${target} RUNTIME DESTINATION "obs-3dgs/bin/64bit" LIBRARY DESTINATION "obs-3dgs/bin/64bit")
  install(DIRECTORY "${PROJECT_SOURCE_DIR}/data/" DESTINATION "obs-3dgs/data")
  install(DIRECTORY "${PROJECT_SOURCE_DIR}/dist/web/" DESTINATION "obs-3dgs/data/web")
  install(DIRECTORY "${PROJECT_SOURCE_DIR}/docs/" DESTINATION "obs-3dgs/data/docs")
  install(FILES "${PROJECT_SOURCE_DIR}/LICENSE" DESTINATION "obs-3dgs/data/licenses" RENAME "GPL-2.0-or-later.txt")

  add_custom_command(
    TARGET ${target}
    POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/rundir/$<CONFIG>/obs-3dgs/bin/64bit"
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/rundir/$<CONFIG>/obs-3dgs/data"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different "$<TARGET_FILE:${target}>" "${CMAKE_CURRENT_BINARY_DIR}/rundir/$<CONFIG>/obs-3dgs/bin/64bit/"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${PROJECT_SOURCE_DIR}/data" "${CMAKE_CURRENT_BINARY_DIR}/rundir/$<CONFIG>/obs-3dgs/data"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${PROJECT_SOURCE_DIR}/dist/web" "${CMAKE_CURRENT_BINARY_DIR}/rundir/$<CONFIG>/obs-3dgs/data/web"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${PROJECT_SOURCE_DIR}/docs" "${CMAKE_CURRENT_BINARY_DIR}/rundir/$<CONFIG>/obs-3dgs/data/docs"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${PROJECT_SOURCE_DIR}/LICENSE" "${CMAKE_CURRENT_BINARY_DIR}/rundir/$<CONFIG>/obs-3dgs/data/licenses/GPL-2.0-or-later.txt"
    VERBATIM
  )
endfunction()
