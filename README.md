![Build Site](https://github.com/40ants/40ants.github.com/workflows/Build%20Site/badge.svg)

### Introduction ###

In this short tutorial I'll describe how to easily bootstrap a project
website. One example of this approach is the Embeddable Common-Lisp
website with it's RSS feed.

Additionally I'll show here how to create a standalone executable
`coleslaw` with `clon` after producing with `quicklisp` an independant
bundle of systems.

### Quick start ###
First clone the repository:

```shell
$ cd ~/workspace
$ git clone https://gitlab.common-lisp.net/dkochmanski/sclp.git website
$ cd website
```

Now you should adjust the appropriate files. Edit `.coleslawrc` (file
is self-explanatory), static pages and posts.

Each file with the extension `*.page` is a static
page. `pages/main.page` is an example template with a static page –
don't forget to link it in the `.coleslawrc`'s `sitenav`
section. Exact URL of the page is declared in the file's header.

Files named `*.post` represent blog/news posts which appear in the RSS
feed. They are indexed and accessible from the root URL. Supported
file formats are `markdown`, `html` and `cl-who` (if enabled).

When you're done, you could just load coleslaw with your favorite CL
implementation, using Quicklisp load `coleslaw` and call the function
main on the website directory:

```common-lisp
(ql:quickload 'coleslaw)
(coleslaw:main "~/workspace/website/")
```

We will take however somewhat more ambitious road – we'll create a
standalone executable with a proper CLI built from a clean bundle
produced by Zach Beane's [*Quicklisp*](https://quicklisp.org). CLI
arguments will be handled by
[*Clon – the Command-Line Options Nuker*](http://www.lrde.epita.fr/~didier/software/lisp/clon.php),
an excellent deployment solution created by Didier Verna.


### Creating the bundle ###

Bundle is a self-containing tree of systems packed with their
dependencies. It doesn't require internet access or `Quicklisp` and is
a preferred solution for the application deployment.

Some dependencies aren't correctly detected – `Quicklisp` can't
possibly know, that our plugin will depend on the `cl-who` system, and
it can't detect `cl-unicode`'s requirement during the build phase –
`flexi-streams` (this is probably a bug). We have to mention these
systems explicitly.

`Clon` is added to enable the *clonification* (keep reading).

```common-lisp
(ql:bundle-systems '(coleslaw flexi-streams
                     cl-who cl-fad
                     net.didierverna.clon)
                   :to #P"/tmp/clw")
```

### Clonifying the application ###

```common-lisp
(in-package :cl-user)
(require "asdf")

(load "bundle")
(asdf:load-system :net.didierverna.clon)
(asdf:load-system :coleslaw)
(asdf:load-system :cl-fad)
(asdf:load-system :cl-who)

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
```

You may generate the executable with your favourite Common Lisp
implementation. Our example will use `ccl` for that.

Issue the following in the bundle directory (`/tmp/clw`):

```shell
ccl -n -l clonify.lisp
```

This command should create native executable named `coleslaw` in the
same directory. On my host `ccl` produces binary with the approximate
size 50M.

### Executable usage ###

This is a very simple executable definition. You may extend it with
new arguments, more elaborate help messages, even colors.

To generate a websites with sources in directories `/tmp/a` and
`/tmp/b` you call it as follows:

```shell
./coleslaw /tmp/a /tmp/b
```

That's all. Deployment destination is set in the `.coleslawrc` file in
each website directory.

### Adding GIT hooks ###

You may configure a post-receive hook for your GIT repository, so your
website will be automatically regenerated on each commit. Let's
assume, that you have put the `coleslaw` standalone executable in
place accessible with the `PATH` environment variable. Enter your bare
git repository and create the file `hooks/post-receive`:

```shell
cd website.git

cat > hooks/post-receive <<EOF
########## CONFIGURATION VALUES ##########

TMP_GIT_CLONE=$HOME/tmp-my-website/

########## DON'T EDIT ANYTHING BELOW THIS LINE ##########

if cd `dirname "$0"`/..; then
    GIT_REPO=`pwd`
    cd $OLDPWD || exit 1
else
    exit 1
fi

git clone $GIT_REPO $TMP_GIT_CLONE || exit 1

while read oldrev newrev refname; do
    if [ $refname = "refs/heads/master" ]; then
        echo -e "\n  Master updated. Running coleslaw...\n"
        coleslaw $TMP_GIT_CLONE
    fi
done

rm -rf $TMP_GIT_CLONE
exit
EOF
```

That's all. Now when you push to the master branch your website will
be regenerated. By default `.gitignore` file lists directory
`static/files` as ignored to avoid keeping binary files in the
repository. If you copy something to the static directory you will
have to run coleslaw by hand.

### Conclusion ###

`Coleslaw` is a very nice project simplifying managing project website
with easy bootstrapping the site without any need to maintain working
lisp process on the server (this is static content which may be served
with `nginx` or `apache`) and allowing easy blogging (write a post in
`markdown` and push to the repository).

`Sample Common-Lisp Project` is a pre-configured website definition
with a theme inspired by the `common-lisp.net` projects themes with
some nice features, like RSS feed and blog engine (thanks to
coleslaw).

We have described the process of creating a simple website, creating a
standalone executable (which may be shared by various users) and
chaining it with git hooks.

### References ###

* [SCLP repository](https://gitlab.common-lisp.net/dkochmanski/sclp)
* [Coleslaw documentation](https://github.com/kingcons/coleslaw)
* [Good writing on coleslaw](http://jany.st/post/2015-12-07-blogging-with-coleslaw.html)
* [Clon homepage](http://www.lrde.epita.fr/~didier/software/lisp/clon.php)
