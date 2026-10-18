(ql:quickload '("staticl" "plump") :silent t)

(defpackage #:the40ants/seo
  (:use #:cl)
  (:export #:description-from-html
           #:description-from-rendered-html))

(when (probe-file "static/seo-descriptions.lisp")
  (load "static/seo-descriptions.lisp"))

(unless (fboundp 'the40ants/seo:description-from-html)
  (error "The SEO description implementation is missing"))

(unless (fboundp 'the40ants/seo:description-from-rendered-html)
  (error "The rendered-excerpt compatibility path is missing"))

(defun check-description (html expected)
  (let ((actual (the40ants/seo:description-from-html html)))
    (unless (equal actual expected)
      (error "Expected ~S, got ~S" expected actual))))

(check-description
 "<p><img src='cover.jpg' alt='Cover'></p><p>Новый <a href='/search'>поиск</a> по проектам и символам.</p>"
 "Новый поиск по проектам и символам.")

(check-description
 "<pre><code>CL-USER&gt; (search-roots)</code></pre><p>Причина утечки памяти найдена.</p>"
 "Причина утечки памяти найдена.")

(check-description
 "<video src='demo.mp4'></video><p>Это один короткий абзац &amp; он остаётся целиком.</p>"
 "Это один короткий абзац & он остаётся целиком.")

(unless (equal "Первый абзац."
               (the40ants/seo:description-from-rendered-html
                "<p>Первый абзац.</p><!--more--><p>Второй абзац.</p>"))
  (error "Rendered HTML was not split at <!--more-->"))

(unless (equal "Первый абзац."
               (the40ants/seo:description-from-rendered-html
                "<p>Первый абзац.</p><p>Второй абзац.</p>"
                "<p>Первый абзац.</p>"))
  (error "StatiCL's rendered excerpt was not preferred"))

(let ((description
        (the40ants/seo:description-from-html
         (format nil "<p>~A</p>" (make-string 200 :initial-element #\а)))))
  (unless (and (<= (length description) 180)
               (char= (char description (1- (length description))) #\…))
    (error "Long description was not shortened: ~S" description)))

(let* ((site (allocate-instance (find-class 'staticl/site:site)))
       (post (apply #'make-instance 'staticl/content/post:post
                    (staticl/content/reader:read-content-file
                     (truename "ru/posts/zachem-mne-clos-obuek-69.post"))))
       (generated (gethash "description" (staticl/theme:template-vars site post))))
  (unless (and generated
               (search "CLOS" generated)
               (not (search "<video" generated)))
    (error "Short post needs a text description: ~S" generated))
  (staticl/content:set-metadata post "description" "Авторское описание")
  (unless (equal "Авторское описание"
                 (gethash "description" (staticl/theme:template-vars site post)))
    (error "Explicit description was replaced"))
  (staticl/content:set-metadata post "description" "A \"quoted\" & <tag>")
  (let* ((real-site (staticl/site:make-site (truename ".")))
         (html (with-output-to-string (stream)
                 (staticl/content:write-content-to-stream real-site post stream))))
    (unless (search "content=\"A &quot;quoted&quot; &amp; &lt;tag&gt;\"" html)
      (error "Description was not escaped in page HTML"))))

(format t "SEO description tests passed.~%")
