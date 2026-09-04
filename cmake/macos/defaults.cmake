include_guard(GLOBAL)

if(NOT CODESIGN_IDENTITY)
  set(CODESIGN_IDENTITY "-" CACHE STRING "macOS code signing identity" FORCE)
endif()
if(NOT DEFINED CODESIGN_TEAM)
  set(CODESIGN_TEAM "" CACHE STRING "macOS code signing team" FORCE)
endif()

include(xcode)
include(buildspec)

if(CMAKE_INSTALL_PREFIX_INITIALIZED_TO_DEFAULT)
  set(
    CMAKE_INSTALL_PREFIX
    "$ENV{HOME}/Library/Application Support/obs-studio/plugins"
    CACHE PATH
    "Default OBS plugin installation directory"
    FORCE
  )
endif()

set(CMAKE_MACOSX_RPATH ON)
set(CMAKE_INSTALL_RPATH "@executable_path/../Frameworks")
