# WebDev

This is intended to be a collection of tools/libaries and docs for how I approach modern web development.

## Philosophy

Mostly you will find web dev that center around:

- Python
- FastAPI
- Typescript
- 11ty
- Lit
- Bun
- UV

My approach is rooted in **progressive enhancement**, meaning we start as close to HTML as possible,
with features loading in the client as needed; and **progressive architecture**, meaning we start as 
close to serving static HTML as possible, with capabilities developed only as necessary.

I tend towards serving static content on a CDN or simple Python servers serving content the
old-school way, and moving towards JAMStack or Single Page APPs as necessary. 

I'm never in NEXT.js, server-side components, or the like, as I view that as a trap that does not 
allow progressive anything.

I try to encapsulate client features into Web Components with [Lit](https://lit.dev), as it's the 
only front-end "framework" that actively attempts to make itself obsolete by working with standards
and focusing on interoperability.

I often start with Google Auth and Firestore or Supabase simply because it serves as a quick start.

These days I work heavily with AI to generate code, but in ways that give me full control and 
visibility on the final output. I am experimenting with new ways to do so. I believe the future is
AI embeded into the apps themselves to allow them to grow more like organisms and less like machines
but that it will be *very* constrained as prompt injection and security concerns become the norm.

I believe in an ethical approach to development that starts at the word "interoperability" and goes
all the way up to politics and moral philosophy. We the builders are ultimately responsible for what
we build.
