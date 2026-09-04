# SPDX-License-Identifier: GPL-2.0-or-later
include_guard(GLOBAL)

function(obs3dgs_dependency_version data platform result)
  string(JSON selected ERROR_VARIABLE missing GET "${data}" versions "${platform}")
  if(missing)
    string(JSON selected GET "${data}" version)
  endif()
  set(${result} "${selected}" PARENT_SCOPE)
endfunction()
