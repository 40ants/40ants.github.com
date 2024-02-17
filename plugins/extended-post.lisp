(uiop:define-package #:coleslaw-extended-post
  (:use #:cl))
(in-package #:coleslaw-extended-post)


(defclass xpost (coleslaw:post)
  ((description :initarg :description)))


(defmethod coleslaw:publish ((doc-type (eql (find-class 'xpost))))
  (loop for (next post prev) on (append '(nil) (coleslaw::by-date (coleslaw:find-all 'xpost)))
        while post
        do ;; (break)
           (coleslaw:write-document post nil
                                    :prev prev
                                    :next next)))

(defun enable ())
