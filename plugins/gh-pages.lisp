(eval-when (:compile-toplevel :load-toplevel)
  (ql:quickload 'local-time))


(defpackage :coleslaw-gh-pages
  (:use :cl)
  (:import-from :coleslaw #:*config*
                          #:rel-path
                          #:fmt
                          #:run-program
                          #:staging-dir
                          #:domain
                          #:with-current-directory
                          #:update-symlink)
  (:export #:enable))

(in-package :coleslaw-gh-pages)


(defvar *datetime-format*
  '((:YEAR 4) #\- (:MONTH 2) #\- (:DAY 2)
    #\Space
    (:HOUR 2) #\: (:MIN 2))
  "Date and time format for commit message.")


(defvar *cname* nil
  "The domain CNAME for github to serve pages from.")


(defvar *index-page* nil
  "Name of the page to make an \"index\". For example: \"about.html\".")

(defvar *branch* "gh-pages"
  "Documentation branch. For project pages it should be \"gh-pages\" for user's or organization's site – \"master\".")


(defvar *push-to-github-from-branch* nil
  "Set this to a string like \"master\" or \"develop\", and new site will be pushed to the github after successful deployment.

   Current branch will be taken from CIRCLE_BRANCH env variable.")


(defun get-current-branch ()
  (uiop:getenv "CIRCLE_BRANCH"))


(defun run (program &rest args)
  (inferior-shell:run (fmt program args)
                      :show t
                      :output :interactive
                      :error-output :interactive))


(defun empty-string-p (string)
  (eql (length string)
       0))


(defun get-git-branches (&key (remote nil))
  "Returns remote branches for current git repository"
  (let* ((output (with-output-to-string (s)
                   (inferior-shell:run (if remote
                                           "git branch --remote"
                                           "git branch")
                                       :output s)))
         (lines (remove-if #'empty-string-p
                           (split-sequence:split-sequence #\Newline output)))
         (stripped-lines (mapcar (lambda (line)
                                   (subseq line 2))
                                 lines)))
    stripped-lines))


(defun switch-to-branch (repo-dir branch)
  "Switches git repository to a given branch or creates a new branch."
  (with-current-directory repo-dir
    (let ((remote-branches (get-git-branches :remote t))
          (local-branches (get-git-branches))
          (remote-branch (concatenate 'string "origin/" branch)))

      (cond
        ;; checkout to existing local branch
        ((member branch
                 local-branches
                 :test #'string=)
         (run "git checkout ~A" branch))
        ;; create a new branch from remote one
        ((member remote-branch
                 remote-branches
                 :test #'string=)
         (run "git checkout -b ~A ~A" branch remote-branch))
        ;; create a new branch from the HEAD if there is no remote branch
        (t (run "git checkout -b ~A" branch))))))


(defun remove-git-files (dir)
  "Removes all files from git repository and adds changes
to the stage."
  (with-current-directory dir
    (run "git rm -fr .")))


(defun prepare-staging-dir (staging-dir)
  "Clones current git repository to a directory
pointed by staging-dir and checking out gh-pages branch there."
  (when (uiop:directory-exists-p staging-dir)
    (uiop:delete-directory-tree staging-dir
                                :validate t))
  
  (run "git clone . ~a" staging-dir)
  (switch-to-branch staging-dir *branch*)
  (remove-git-files staging-dir))


(defun enable (&key cname index-page push-from-branch branch)
  (setf *cname* (if cname
                    cname
                    (domain *config*)))

  (setf *index-page* index-page)
  
  (when branch
    (setf *branch* branch))

  (setf *push-to-github-from-branch* push-from-branch)

  (prepare-staging-dir (staging-dir *config*)))


(defun create-commit-message ()
  "Returns something like \"Update from 2016-10-14 10:45\"."
  (let* ((now (local-time:now))
         (formatted-datetime (local-time:format-timestring
                              nil
                              now
                              :format *datetime-format*)))
    (format nil "Update from ~A" formatted-datetime)))


(defun git-commit-all (message)
  "Adds all files to the staging and commit them with given commit message."
  (run "git add --all")
  (run "git commit -m '~A'" message))


(defun git-push (&key (branch "HEAD") force)
  "Pushes current branch to origin branch."
  (run "git rev-parse ~A"
       branch)
  (if force
      (run "git push --force origin ~A"
           branch)
    (run "git push origin ~A"
         branch)))


(defmethod coleslaw:deploy (staging)
  (format t "Deploying to GitHub~%")

  (with-current-directory staging
    (when *cname*
      (run "echo ~a > CNAME" *cname*))
    
    (run "cp -R /root/project/.circleci ./")
    
    (when *index-page*
      (run "rm index.html")
      (run "cp ~a index.html" *index-page*))

    ;; staging is already on gh-page branch
    ;; with fresh files after site compilation
    ;; all we need is to commit changes to the branch
    (git-commit-all (create-commit-message))
    ;; and to push them into the working dir (origin)
    (git-push))

  (when (and *push-to-github-from-branch*
             (string-equal (get-current-branch)
                           *push-to-github-from-branch*))
    ;; if :push option was given, then upload gh-pages branch
    ;; to the GitHub
    (git-push :branch *branch*)))
