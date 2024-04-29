(eval-when (:compile-toplevel :load-toplevel)
  (ql:quickload '(spinneret
                  ;; We need these libs on the pages
                  dexador
                  str
                  github)
                :silent t))

(defpackage :coleslaw-spinneret
  (:use #:cl #:spinneret)
  (:import-from #:coleslaw :render-text)
  (:export #:enable))

(in-package :coleslaw-spinneret)


(defmethod render-text (text (format (eql :spinneret)))
  (let* (;; (*package* (find-package '#:coleslaw-cl-who-renderer))
         (sexps
           (with-input-from-string (s text)
             (uiop:slurp-stream-forms s))))
    (eval `(spinneret:with-html-string ()
             ,@sexps))))

(defun enable ())
