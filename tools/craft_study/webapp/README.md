# Crafting Profit Plan web app

Builds the web app (https://claude.ai/artifact/AgGCkZnZMiBv36y4bXrxAj) from the
Claude Doc "Best Item to Craft" (doc id 0fa2eb9d-5b91-4406-aa3c-98d2e5b098e9, body node 96e4567c-44a9).
The doc is the source of truth; the app is regenerated from it.

1. Read the doc with the Claude Docs `read` tool (ref node 96e4567c-44a9, payload {"kind":"view"})
   and save the result JSON (or just its xml) to a file.
2. `python3 gen.py <saved read>` then `python3 build.py <out.html>`.
3. Publish <out.html> to the artifact URL above.

The "at a glance" tiles and the spec calculator data (J and X arrays in shell.html: base focus, profit with and without focus, caps) are hand-written from the study; update them if the doc's numbers change.
New H2 sections need an entry in META (gen.py) and ORDER (build.py).
