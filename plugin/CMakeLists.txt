add_library(obs-3dgs MODULE)

target_sources(
  obs-3dgs
  PRIVATE
    plugin-main.cpp
    angle-utils.hpp
    asset-validation.cpp
    asset-validation.hpp
    dock.cpp
    dock.hpp
    dock-preset-state.hpp
    dock-status.hpp
    dock-visibility.hpp
    lens-presets.hpp
    localization.cpp
    localization.hpp
    local-server.cpp
    local-server.hpp
    one-shot-authorization.hpp
    pending-dock-edits.hpp
    scalar-control.hpp
    property-ui.cpp
    property-ui.hpp
    property-ui-state.hpp
    settings-snapshot.cpp
    settings-snapshot.hpp
    source.cpp
    source.hpp
    source-selection.cpp
    source-selection.hpp
)

target_link_libraries(
  obs-3dgs
  PRIVATE
    OBS::libobs
    OBS::obs-frontend-api
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Threads::Threads
    httplib::httplib
    nlohmann_json::nlohmann_json
)

target_compile_definitions(
  obs-3dgs
  PRIVATE
    OBS_3DGS_VERSION="${PLUGIN_VERSION}"
    CPPHTTPLIB_THREAD_POOL_COUNT=4
)

set_target_properties(obs-3dgs PROPERTIES AUTOMOC ON AUTOUIC ON AUTORCC ON)
add_dependencies(obs-3dgs obs-3dgs-web)
set_target_properties_plugin(obs-3dgs)
