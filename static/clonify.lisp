(in-package :cl-user)

#-quicklisp
(progn
 (require "asdf")
 (load "bundle")
 (asdf:load-system :net.didierverna.clon)
 (asdf:load-system :coleslaw)
 (asdf:load-system :cl-fad)
 (asdf:load-system :cl-who))

#+quicklisp
(progn
  (ql:quickload :net.didierverna.clon)
  (ql:quickload :coleslaw)
  (ql:quickload :cl-fad)
  (ql:quickload :cl-who))

(net.didierverna.clon:defsynopsis
 (:postfix "DIR*")
 (text :contents "Application builds websites from provided directories.")
 (flag :short-name "h" :long-name "help"
       :description "Print this help and exit."))

(defun main ()
  "Entry point for our standalone application."
  (net.didierverna.clon:make-context)
  (when (net.didierverna.clon:getopt :short-name "h")
    (net.didierverna.clon:help)
    (net.didierverna.clon:exit))
  (print (net.didierverna.clon:remainder))
  (handler-case (mapcar
		 #'(lambda (p)
		     (coleslaw:main
		      (truename (cl-fad:pathname-as-directory p))))
		 (net.didierverna.clon:remainder))
		(error (c) (format t "Generating website failed:~%~A" c)))
  (terpri)
  (exit))

(net.didierverna.clon:dump "coleslaw" main)
