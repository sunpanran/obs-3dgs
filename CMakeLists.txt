cmake_minimum_required(VERSION 3.30...4.4)

if(CMAKE_HOST_SYSTEM_NAME MATCHES "Linux|FreeBSD|OpenBSD")
  message(FATAL_ERROR "obs-3dgs 0.1 does not support Linux or BSD hosts.")
endif()

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/buildspec.json" buildspec)
string(JSON _name GET ${buildspec} name)
string(JSON _author GET ${buildspec} author)
string(JSON _website GET ${buildspec} website)
string(JSON _version GET ${buildspec} version)
string(JSON _release_version GET ${buildspec} releaseVersion)
string(JSON _bundle_id GET ${buildspec} platformConfig macos bundleId)

project(${_name} VERSION ${_version} LANGUAGES C CXX)

set(PLUGIN_AUTHOR "${_author}")
set(PLUGIN_WEBSITE "${_website}")
set(PLUGIN_VERSION "${_release_version}")
set(MACOS_BUNDLEID "${_bundle_id}")
string(TIMESTAMP CURRENT_YEAR "%Y")

set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_FIND_PACKAGE_TARGETS_GLOBAL ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake/common")
if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
  set(OS_WINDOWS ON)
  list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake/windows")
elseif(CMAKE_HOST_SYSTEM_NAME STREQUAL "Darwin")
  set(OS_MACOS ON)
  list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake/macos")
else()
  message(FATAL_ERROR "Unsupported build host: ${CMAKE_HOST_SYSTEM_NAME}")
endif()

include(buildnumber)
include(defaults)
include(compilerconfig)
include(helpers)

include(FetchContent)
set(HTTPLIB_USE_OPENSSL_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
set(HTTPLIB_REQUIRE_OPENSSL OFF CACHE BOOL "" FORCE)
# Local assets are already encoded; do not auto-link host-only compression libraries.
foreach(codec IN ITEMS ZLIB BROTLI ZSTD)
  set(HTTPLIB_USE_${codec}_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
  set(HTTPLIB_REQUIRE_${codec} OFF CACHE BOOL "" FORCE)
endforeach()
set(HTTPLIB_TEST OFF CACHE BOOL "" FORCE)
set(HTTPLIB_INSTALL OFF CACHE BOOL "" FORCE)
set(JSON_Install OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
  cpp_httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.51.0
  GIT_SHALLOW TRUE
)
FetchContent_Declare(
  nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz
  URL_HASH SHA256=42f6e95cad6ec532fd372391373363b62a14af6d771056dbfc86160e6dfff7aa
)
FetchContent_MakeAvailable(cpp_httplib nlohmann_json)

find_package(libobs REQUIRED)
find_package(obs-frontend-api REQUIRED)
find_package(Qt6 6.7 REQUIRED COMPONENTS Core Gui Widgets)
find_package(Threads REQUIRED)
find_program(NPM_EXECUTABLE NAMES npm npm.cmd REQUIRED)

add_custom_target(
  obs-3dgs-web
  COMMAND "${NPM_EXECUTABLE}" run build
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  BYPRODUCTS "${CMAKE_CURRENT_SOURCE_DIR}/dist/web/index.html"
  COMMENT "Build the bundled Spark web runtime"
  VERBATIM
)

add_subdirectory(plugin)

include(CTest)
if(BUILD_TESTING)
  add_subdirectory(tests/native)
endif()
