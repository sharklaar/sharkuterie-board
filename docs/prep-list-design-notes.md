# Prep-list design notes — paused 28 October 2026

This is a record of the discussion, not an approved implementation specification. No prep-list code or database changes have been made.

## Agreed direction

- Defer prep-list development until the user wants to revisit it; avoid adding complexity now.
- Use explicit inclusion flags rather than infer prep inclusion from displayed plating labels or method headings.
- The user asked for an explicit flag on recipe items indicating whether they belong on the prep list. The precise placement (recipe, ingredient/component row, or both) needs confirming.
- Raw ingredients such as salt, vinegar and flour must remain on recipes even when they do not represent prep work.
- Staff float between sections; do not assign people permanently to sections.
- Recipes and their data must be preserved. Generating, editing or completing a prep list must not rewrite or delete its source recipes.

## Proposed architecture — not yet agreed

- Distinguish a recipe-level “Include in prep lists” flag from an ingredient/component-level “Needs prep” flag. This two-level model was proposed by the assistant but has not been accepted.
- An optional prep instruction could make a component actionable, such as “Make Rockefeller butter”.
- Extra recipe prep tasks could cover work not represented by ingredient rows, such as portioning fish or washing herbs.
- Create separate dated prep-list records, containing snapshots of selected dishes/items plus source references. Later recipe edits should not silently rewrite historical lists.
- Preview the generated list before saving. A repeat generation should create an explicit revision rather than silently overwrite an existing list.
- Begin with manual identification of prep-worthy items. Ingredient names alone cannot reliably determine preparation work.
- A section preview could preselect matching included dishes and let an admin exclude off-menu dishes without introducing a full menu-management system.

## Earlier requirements to retain

- Professional organisations only.
- Admin-created lists using recipes in the selected organisation/section.
- General notes area for additional instructions.
- To do and Done boxes on each item; their interaction is still undecided.
- Today by default, date navigation and planning for tomorrow.
- Durable audit history, including who changed statuses and when.
- Admins can access any section's lists in their organisation. Access/section selection for floating staff is undecided.

## Questions for later

- Does “recipe item” mean the whole recipe or each ingredient/component row? Is one inclusion flag sufficient for the first version?
- Which rows should become actionable prep work? Should raw ingredients ever become stock-check items instead?
- Are prep instructions or extra tasks actually needed initially, or unnecessary complexity?
- Should repeated components be kept separate or combined? How would quantities and batch scaling work?
- How do To do and Done relate, and who can edit notes or completed lists?
- Do dates follow calendar days or the 03:00 operational-day boundary?
- Should Shared behave specially in future prep lists? For current recipe sections it is ordinary.

## Data-safety approach when work resumes

Use additive schema changes, back up production, rehearse migrations against a copy, compare original records before and after, and test that prep-list operations cannot modify source recipes. Preserve audit snapshots independently of source recipe deletion. Release in small stages: inclusion/classification, read-only preview, saved lists, then working checklist and audit.

## Earlier claim to verify if relevant

The assistant initially said plating was not explicit without fully tracing the displayed label. The user challenged this. Do not repeat that claim without inspecting the actual display logic; explicit prep inclusion is preferred regardless.
