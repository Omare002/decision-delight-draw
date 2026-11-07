<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules

- Never apply a bold weight to the single-weight display font (Bagel Fat One) and never
  rely on its drop shadow at small sizes — it ships in one weight, so "bold" is synthesized
  and fills in the letter counters; hierarchy must come from size, colour and spacing instead.
- On narrow mobile, card titles and captions reserve a fixed number of line boxes (`min-h`)
  so grid cards stay even, and every caption must be checked for clipping at 320px.

