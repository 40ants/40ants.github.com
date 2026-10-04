(defpackage #:the40ants/seo
  (:use #:cl)
  (:export #:description-from-html))

(in-package #:the40ants/seo)


(defun block-element-p (name)
  (member name '("p" "div" "li" "blockquote" "h1" "h2" "h3" "br")
          :test #'string-equal))


(defun ignored-element-p (name)
  (member name '("pre" "script" "style" "video" "audio")
          :test #'string-equal))


(defun html-visible-text (html)
  (with-output-to-string (output)
    (labels ((visit (node)
               (cond
                 ((typep node 'plump:text-node)
                  (write-string (plump:text node) output))
                 ((typep node 'plump:element)
                  (let ((name (plump:tag-name node)))
                    (unless (ignored-element-p name)
                      (map nil #'visit (plump:children node))
                      (when (block-element-p name)
                        (write-char #\Space output)))))
                 ((typep node 'plump:nesting-node)
                  (map nil #'visit (plump:children node))))))
      (visit (plump:parse html)))))


(defun whitespace-p (character)
  (or (find character '(#\Space #\Tab #\Newline #\Return #\Page))
      (= (char-code character) 160)))


(defun collapse-whitespace (text)
  (string-trim " "
               (with-output-to-string (output)
                 (let ((previous-space nil))
                   (loop for character across text
                         do (if (whitespace-p character)
                                (unless previous-space
                                  (write-char #\Space output)
                                  (setf previous-space t))
                                (progn
                                  (write-char character output)
                                  (setf previous-space nil))))))))


(defun shorten-description (text &optional (limit 180))
  (if (<= (length text) limit)
      text
      (let ((sentence-end
              (loop for index downfrom (1- limit) to 90
                    when (and (find (char text index) ".!?")
                              (whitespace-p (char text (1+ index))))
                      return index)))
        (if sentence-end
            (subseq text 0 (1+ sentence-end))
            (let ((word-end (position #\Space text :end limit :from-end t)))
              (concatenate 'string
                           (subseq text 0 (or word-end (1- limit)))
                           "…"))))))


(defun description-from-html (html)
  (let ((text (collapse-whitespace (html-visible-text html))))
    (unless (zerop (length text))
      (shorten-description text))))


(defmethod staticl/theme:template-vars :around
    ((site staticl/site:site) (post staticl/content/post:post)
     &key (hash (make-hash-table :test 'equal)))
  (let ((vars (call-next-method site post :hash hash)))
    (unless (and (gethash "description" vars)
                 (plusp (length (string-trim " " (gethash "description" vars)))))
      (setf (gethash "description" vars)
            (or (description-from-html
                 (staticl/content/html-content:content-html-excerpt post))
                (description-from-html
                 (staticl/content/html-content:content-html post)))))
    vars))
