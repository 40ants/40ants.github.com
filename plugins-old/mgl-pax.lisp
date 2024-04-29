(eval-when (:compile-toplevel :load-toplevel)
  (ql:quickload '(mgl-pax log4cl)
                :silent t))

(defpackage #:coleslaw-mgl-pax
  (:use #:cl)
  (:import-from #:coleslaw
                #:render-text)
  (:import-from #:log4cl))
(in-package coleslaw-mgl-pax)


(defvar *page*)


;; Hack to access page object inside the render-text
(defmethod initialize-instance :around ((object coleslaw-static-pages::page) &key)
  (let ((*page* object))
    (call-next-method)))


(defun eval-forms-from-string (string &key package)
  (let ((*package* (or package
                       *package*)))
    (with-input-from-string (s string)
      (loop for form in (uiop:slurp-stream-forms s)
            do (eval form)))))


(defmethod render-text (text (format (eql :mgl-pax)))
  "Evaluates post's content as a Lisp file and interprets POST variable as MGL-PAX documentation section."
  (let* ((file (coleslaw::content-file *page*))
         (package (or (find-package file)
                      (make-package file
                                    :use '("CL" "MGL-PAX"))))
         (loaded (eval-forms-from-string text :package package))
         (main-section (symbol-value
                        (intern "POST" package)))
         (rendered
           (let ((mgl-pax:*document-max-table-of-contents-level* 0)
                 ;; To not show ↺ link at the top of the post
                 (mgl-pax:*document-fancy-html-navigation* nil)
                 ;; To not render [in package ...] headers
                 (mgl-pax:*document-normalize-packages* nil))
             (mgl-pax:document main-section
                               :format :html))))
    ;; (declare (ignore loaded))
    (log:info "Loaded" loaded main-section)

    (first
     rendered)))


(defun enable ()
  (log:info "Enabling MGL-PAX Coleslaw plugin"))
