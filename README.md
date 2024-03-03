![Build Site](https://github.com/40ants/40ants.github.com/workflows/Build%20Site/badge.svg)

### Introduction ###

This repository contains the source of the https://40ants.com site.

How to build a site:


```common-lisp
(ql:quickload :cl-plus-ssl-osx-fix)
(ql:quickload :coleslaw-cli)
;; To make high a limit on API calls
(setf github:*token*
      "ghp_*******")
(coleslaw-cli:generate)
```

