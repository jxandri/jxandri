%% appletmanual.cls — the shared look of every applet manual in this repository.
%%
%% One class, ten documents: five applets in Spanish and English. Everything
%% that is the same in all of them lives here, so a change to the page or the
%% palette is made once. The fixed words that a manual needs but an author
%% should not have to retype — "Figure", "Activity", "What you should see" —
%% are switched by \manuallang, which every document sets before \begin{document}.
%%
%% Build with pdflatex (twice, for the table of contents):
%%     pdflatex firm-supply-es.tex
%%
%% Requires: XCharter, newtxmath, FiraSans, inconsolata, tcolorbox, titlesec.
%% On Debian/Ubuntu those come from texlive-latex-extra and texlive-fonts-extra.

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{appletmanual}[2026/08/29 Manual for a browser applet]
\LoadClassWithOptions{article}

% ---------------------------------------------------------------- fonts ----
\RequirePackage[T1]{fontenc}
\RequirePackage[utf8]{inputenc}
\RequirePackage[scaled=1.0]{XCharter}
\RequirePackage[charter,scaled=1.04]{newtxmath}
\RequirePackage[sfdefault,scaled=0.92]{FiraSans}
\RequirePackage[varqu,scaled=0.94]{inconsolata}
\renewcommand{\familydefault}{\rmdefault}
\let\Bbbk\relax                      % newtxmath defines it; amssymb wants to too
\RequirePackage{amsmath,amssymb}
\RequirePackage{microtype}
\RequirePackage{textcomp}

% Glyphs that get pasted in from the applets' own interface strings.
\DeclareUnicodeCharacter{2202}{\ensuremath{\partial}}
\DeclareUnicodeCharacter{2207}{\ensuremath{\nabla}}
\DeclareUnicodeCharacter{2264}{\ensuremath{\le}}
\DeclareUnicodeCharacter{2265}{\ensuremath{\ge}}
\DeclareUnicodeCharacter{2212}{\textendash}
\DeclareUnicodeCharacter{00B7}{\textperiodcentered}

% -------------------------------------------------------------- page ------
\RequirePackage[a4paper,top=27mm,bottom=25mm,left=26mm,right=26mm,
                headheight=15pt,footskip=13mm]{geometry}
\RequirePackage{graphicx}
\RequirePackage{xcolor}
\RequirePackage{booktabs}
\RequirePackage{tabularx}
\RequirePackage{array}
\RequirePackage{enumitem}
\RequirePackage{tcolorbox}
\RequirePackage{titlesec}
\RequirePackage{fancyhdr}
\RequirePackage{caption}
\RequirePackage{needspace}
\RequirePackage[titles]{tocloft}
\RequirePackage[hidelinks,pdfusetitle]{hyperref}
\tcbuselibrary{skins,breakable}

\raggedbottom
\setlength{\parskip}{0.45\baselineskip}
\setlength{\parindent}{0pt}
\setlength{\emergencystretch}{2em}

% ------------------------------------------------------------ palette -----
% Lifted from the applets' own light theme, so a manual and the page it
% documents are recognisably the same object.
\definecolor{ink}      {HTML}{14181B}
\definecolor{ink2}     {HTML}{48555C}
\definecolor{ink3}     {HTML}{7C8B93}
\definecolor{rule}     {HTML}{CBD4D8}
\definecolor{rule2}    {HTML}{E1E7EA}
\definecolor{accent}   {HTML}{0E6E78}
\definecolor{accentink}{HTML}{0A4F57}
\definecolor{accentbg} {HTML}{E8F2F3}
\definecolor{warnc}    {HTML}{9A5B00}
\definecolor{warnbg}   {HTML}{FBF1E2}
\definecolor{critc}    {HTML}{A93726}
\definecolor{goodc}    {HTML}{1B6E48}
\definecolor{goodbg}   {HTML}{E7F3EC}
\definecolor{panelbg}  {HTML}{F3F6F7}
\color{ink}

% ---------------------------------------------------- localised strings ---
\newcommand{\am@figure}{Figure}
\newcommand{\am@activity}{Activity}
\newcommand{\am@expect}{What you should see}
\newcommand{\am@settings}{Settings}
\newcommand{\am@contents}{Contents}
\newcommand{\am@manual}{Manual}
\newcommand{\am@note}{Note}
\newcommand{\am@watch}{Watch out}
\newcommand{\am@key}{The point}

\newcommand{\manuallang}[1]{%
  \def\am@lang{#1}%
  \ifx\am@lang\am@es
    \renewcommand{\am@figure}{Figura}%
    \renewcommand{\am@activity}{Actividad}%
    \renewcommand{\am@expect}{Lo que debe verse}%
    \renewcommand{\am@settings}{Ajustes}%
    \renewcommand{\am@contents}{Contenido}%
    \renewcommand{\am@manual}{Manual}%
    \renewcommand{\am@note}{Nota}%
    \renewcommand{\am@watch}{Ojo}%
    \renewcommand{\am@key}{La idea}%
  \fi
}
\def\am@es{es}
\def\am@lang{en}

% ------------------------------------------------------------ metadata ----
\newcommand{\appletname}[1]{\def\am@name{#1}}
\newcommand{\appletsub}[1]{\def\am@sub{#1}}
\newcommand{\appletdir}[1]{\def\am@dir{#1}}
\newcommand{\appleturl}[1]{\def\am@url{#1}}
\appletname{Applet}\appletsub{}\appletdir{applet}
\appleturl{https://jxandri.github.io/jxandri/}

% Public names for the metadata, so a document can print them without having to
% make @ a letter first.
\newcommand{\appletfolder}{\am@dir}
\newcommand{\appletsite}{\am@url}

% Figures are looked up under figs/<dir>/<lang>/, so a document never spells
% out a path and the two language editions differ by one \manuallang.
\newcommand{\figpath}[1]{figs/\am@dir/\am@lang/#1.png}

% ---------------------------------------------------------------- toc -----
% The body sets a generous \parskip, which a table of contents inherits and
% which pushes a fourteen-section list onto a second page for no reason. The
% toc gets its own spacing, and a number box wide enough for two digits.
\renewcommand{\cftsecfont}{\normalfont}
\renewcommand{\cftsecpagefont}{\normalfont\small}
\renewcommand{\cftsecleader}{\normalfont\cftdotfill{\cftsecdotsep}}
\renewcommand{\cftsecdotsep}{4}
\setlength{\cftsecnumwidth}{2.3em}
\setlength{\cftbeforesecskip}{2.5pt}
\setlength{\cftsecindent}{0pt}

\newcommand{\manualtoc}{%
  \begingroup
    \setlength{\parskip}{0pt}%
    {\sffamily\bfseries\Large\color{accentink}\am@contents\par}%
    \vspace{3mm}%
    \makeatletter\@starttoc{toc}\makeatother
  \endgroup}

% ------------------------------------------------------------ headings ----
\titleformat{\section}
  {\normalfont\sffamily\bfseries\Large\color{accentink}}{\thesection}{0.7em}{}
\titleformat{\subsection}
  {\normalfont\sffamily\bfseries\large\color{ink}}{\thesubsection}{0.6em}{}
\titleformat{\subsubsection}
  {\normalfont\sffamily\bfseries\normalsize\color{ink2}}{}{0em}{}
\titlespacing*{\section}      {0pt}{1.9\baselineskip}{0.5\baselineskip}
\titlespacing*{\subsection}   {0pt}{1.3\baselineskip}{0.35\baselineskip}
\titlespacing*{\subsubsection}{0pt}{1.0\baselineskip}{0.2\baselineskip}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0pt}
\fancyhead[L]{\sffamily\footnotesize\color{ink3}\am@name}
\fancyhead[R]{\sffamily\footnotesize\color{ink3}\nouppercase{\leftmark}}
\fancyfoot[C]{\sffamily\footnotesize\color{ink3}\thepage}
\renewcommand{\sectionmark}[1]{\markboth{#1}{}}
\let\am@headrule\headrule
\renewcommand{\headrule}{\color{rule}\am@headrule}

% ------------------------------------------------------------- figures ----
\captionsetup{font={small,sf},labelfont={bf,color=accentink},
              labelsep=period,width=0.95\textwidth,skip=6pt}
\renewcommand{\figurename}{\am@figure}

% \fig[width fraction]{name}{caption}
\newcommand{\fig}[3][1.0]{%
  \begin{figure}[htbp]\centering
    \fboxsep=0pt\fboxrule=0.4pt\textcolor{rule}{%
      \fbox{\includegraphics[width=#1\linewidth]{\figpath{#2}}}}
    \caption{#3}
  \end{figure}}

% same, but never floats — for a figure that must sit where the text put it
\newcommand{\figher}[3][1.0]{%
  \begin{figure}[H]\centering
    \fboxsep=0pt\fboxrule=0.4pt\textcolor{rule}{%
      \fbox{\includegraphics[width=#1\linewidth]{\figpath{#2}}}}
    \caption{#3}
  \end{figure}}
\RequirePackage{float}

% ---------------------------------------------------------- call-outs -----
\newtcolorbox{amnote}[1][]{
  enhanced, breakable, colback=accentbg, colframe=accent, colbacktitle=accentbg,
  boxrule=0pt, leftrule=2.2pt, arc=1pt, left=8pt, right=8pt, top=6pt, bottom=6pt,
  fonttitle=\sffamily\bfseries\small\color{accentink},
  title={\am@note}, titlerule=0mm, boxsep=2pt, #1}

\newtcolorbox{amwatch}[1][]{
  enhanced, breakable, colback=warnbg, colframe=warnc, colbacktitle=warnbg,
  boxrule=0pt, leftrule=2.2pt, arc=1pt, left=8pt, right=8pt, top=6pt, bottom=6pt,
  fonttitle=\sffamily\bfseries\small\color{warnc},
  title={\am@watch}, titlerule=0mm, boxsep=2pt, #1}

\newtcolorbox{amkey}[1][]{
  enhanced, breakable, colback=goodbg, colframe=goodc, colbacktitle=goodbg,
  boxrule=0pt, leftrule=2.2pt, arc=1pt, left=8pt, right=8pt, top=6pt, bottom=6pt,
  fonttitle=\sffamily\bfseries\small\color{goodc},
  title={\am@key}, titlerule=0mm, boxsep=2pt, #1}

% ---------------------------------------------------------- activities ----
\newcounter{amact}
\newenvironment{activity}[1]{%
  \needspace{4\baselineskip}%
  \refstepcounter{amact}%
  \begin{tcolorbox}[enhanced, breakable, colback=panelbg, colframe=rule, colbacktitle=panelbg,
    boxrule=0.4pt, arc=1.5pt, left=9pt, right=9pt, top=7pt, bottom=7pt,
    fonttitle=\sffamily\bfseries\small\color{accentink},
    title={\am@activity~\theamact\,\textperiodcentered\,#1}, titlerule=0mm, boxsep=2pt]%
}{\end{tcolorbox}}

% the two fixed sub-headings inside an activity
\newcommand{\amset}{\par\smallskip{\sffamily\bfseries\footnotesize\color{ink2}\am@settings:}\space}
\newcommand{\amexp}{\par\smallskip{\sffamily\bfseries\footnotesize\color{ink2}\am@expect:}\space}

% ---------------------------------------------------------- small bits ----
\newcommand{\ui}[1]{{\sffamily\bfseries #1}}          % a control on screen
\newcommand{\code}[1]{{\ttfamily #1}}                 % something typed
\newcommand{\key}[1]{{\ttfamily\small\colorbox{rule2}{\,#1\,}}}  % a keyboard key

% Plain tabular with fixed p-columns rather than tabularx: tabularx scans the
% input for its own \end, which it cannot find when the \begin is buried inside
% a \newenvironment.
\newenvironment{ctrltable}[1]{%
  \par\smallskip\small
  \begin{tabular}{@{}%
    >{\sffamily\bfseries\raggedright\arraybackslash}p{0.27\linewidth}%
    >{\raggedright\arraybackslash}p{0.66\linewidth}@{}}
  \toprule #1 \\ \midrule
}{\bottomrule\end{tabular}\par\smallskip}

\setlist[itemize]{leftmargin=1.1em,itemsep=1pt,topsep=3pt,parsep=0pt}
\setlist[enumerate]{leftmargin=1.4em,itemsep=1pt,topsep=3pt,parsep=0pt}
\setlist[description]{leftmargin=0pt,itemsep=2pt,topsep=3pt,parsep=0pt,
                      font=\sffamily\bfseries\small\color{ink}}

% ------------------------------------------------------------ title page --
% One big screenshot, the name, the subtitle, and nothing else. The reader
% should recognise the cover as the thing on their screen.
\newcommand{\manualtitlepage}[1]{%
  \begin{titlepage}
  \thispagestyle{empty}
  \vspace*{6mm}
  {\sffamily\footnotesize\color{accentink}\MakeUppercase{\am@manual}\par}
  \vspace{2mm}
  {\sffamily\bfseries\fontsize{30}{34}\selectfont\color{ink}\am@name\par}
  \vspace{3mm}
  {\color{accent}\rule{\linewidth}{2pt}\par}
  \vspace{4mm}
  {\large\color{ink2}\am@sub\par}
  \vfill
  \fboxsep=0pt\fboxrule=0.4pt\textcolor{rule}{%
    \fbox{\includegraphics[width=\linewidth]{\figpath{interface}}}}
  \vfill
  {\small\color{ink3}#1\par}
  \end{titlepage}}
