========================================================================
  GRADIENT PEAKS
  A 3D sandbox for surface plots of functions of two variables
========================================================================

WHAT TO DO RIGHT NOW
--------------------

  1. If this arrived as a .zip file, EXTRACT IT FIRST.
       Windows: right-click the .zip -> "Extract All..." -> Extract
       macOS:   double-click the .zip; use the folder that appears

  2. Double-click:   Gradient-Peaks.html

  3. It opens in your web browser and runs. That is the whole
     installation. No account, no plug-in, no internet connection.

  Read Gradient-Peaks-Guide.pdf for everything else. It is written
  for someone who has never run a program like this before.


WHAT IS IN THIS FOLDER
----------------------

  Gradient-Peaks.html
      THE PROGRAM. One self-contained file. Double-click to run.

  Gradient-Peaks-Lab.html
      THE SAME PROGRAM, second layout: slimmer controls, a
      full-screen button, and a panel in the corner showing the flat
      map. Also double-click to run. The two link to each other.

  Gradient-Peaks-Guia.pdf  /  LEEME.txt
      La misma guia, en espanol. El programa tambien esta en espanol:
      use el selector Espanol / English en el panel, o agregue
      ?lang=es al enlace.

  Gradient-Peaks-Guide.pdf
      The complete guide: how to open it, every control explained,
      how to write your own functions and constraints, ten ready-made
      classroom activities, how to publish it for your students, and
      what to do when something goes wrong.

  website/
      The same program split into its separate files. Use this ONLY
      when publishing to a web address (see Part 8 of the guide) or
      installing it as an app on a phone (Part 9).

      NOTE: double-clicking website/index.html gives a blank screen.
      That is expected -- browsers will not let a page opened from
      your hard drive load its own separate files. Use
      Gradient-Peaks.html instead.

  tools/build-standalone.mjs
      Optional. Rebuilds Gradient-Peaks.html if you edit the source.


QUICK CONTROLS
--------------

  W A S D    walk / fly            Esc    release the mouse pointer
  mouse      look around           Tab    hide or show the panel
  Shift      move faster           1 2 3  first person / third / drone
  Space Ctrl drone up / down       T      look straight down (map)
                                   R      return to the centre

  C level curves     M colour by height   F frontier walls
  X d f/dx arrow     Y d f/dy arrow       V gradient
  B directional derivative                P tangent plane
  O show the optimum                      H highlight the neighbourhood
  J the level curve under your feet   K its tangent line

  The readout along the top always shows x, y, z = f(x,y) and RMS,
  the absolute slope of the level curve, |df/dx divided by df/dy|.

  The drone flies level: W A S D move it over the (x,y) plane and
  Space / Ctrl set its altitude. The beam under it drops straight
  down and marks the point of the domain you are above.

  On a phone: drag the LEFT half to walk, the RIGHT half to look.


THE LAB — A SECOND LAYOUT
-------------------------

  Inside website/ there is also lab.html. It is the same program
  with a narrower control rail, a full-screen button, and a panel in
  the corner showing the flat map your textbook draws: the domain
  from above, the same level curves in the same colours, and the
  explorer as a dot. Walk in the 3D view and the dot walks on the
  map. Part 10 of the guide explains it.

  You can also switch between the two from the link at the bottom
  of the Help section in either one.


SURFACES THAT ARE NOT GRAPHS
----------------------------

  The "Kind of surface" menu also does implicit surfaces
  F(x,y,z) = 0 and parametric ones r(u,v), with nine named ones
  ready to go: sphere, torus, pseudosphere, hyperboloid, catenoid,
  helicoid, Moebius strip, Klein bottle and cross-cap. Click the
  surface to put the explorer on it and walk. Part 8 of the guide.

REQUIREMENTS
------------

  Any computer, tablet or phone from roughly 2014 onward, with a
  reasonably current browser (Chrome, Edge, Firefox or Safari).
  Nothing else. Total size: under one megabyte.


LICENCE
-------

  MIT. Use it, change it, and give it to your students freely.
  Uses three.js (also MIT, (c) three.js authors); its licence travels
  with the files in website/vendor/.
