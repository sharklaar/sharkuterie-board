# Snag list

Checked items are live. The organisation foundation and both production migrations were released on 27 October 2026. Signed-in verification of the primary and Hotmail accounts remains a manual follow-up.

## Completed

- [x] Move method steps up and down, with boundary controls disabled.
- [x] Recipe title placeholder: “e.g. Pea and Mint Soup”.
- [x] Apply local database migrations before starting development.
- [x] Separate organisations: William Cecil and Daffern Family.
- [x] Membership positions independent of Member, Editor and Admin permissions.
- [x] Organisation selector for users with multiple memberships only.
- [x] Header: active organisation on the left, signed-in user on the right.
- [x] Test membership: Marc, marcdaffern@hotmail.com, Member access to Daffern Family only. Primary Marc account retains Admin access to both organisations.
- [x] Store organisation type: William Cecil = Professional; Daffern Family = Lite. This records the distinction; the feature sets below still need implementation.

## Organisation feature sets

- [ ] Define and enforce the Lite and Professional feature sets in both UI and API. Lite retains the family recipe library; professional kitchen workflows below belong to Professional organisations.
- [ ] Professional only: optional recipe sections such as Larder, Pastry and Sauce, managed by organisation admins. Daffern Family does not need sections. Deleting a section leaves its recipes unassigned.
- [ ] Professional only: optional section assignment per organisation membership, independent of kitchen position and access level.
- [ ] Organisation-specific skin and branding.
- [ ] Explicitly enable and verify mobile keyboard autocorrect and spellcheck.

## Professional: check-in / check-out lists

- [ ] Checkbox task lists for the start and end of a shift.
- [ ] Checked state persists until 03:00 the following morning, then resets for the next operational day.
- [ ] Store the day's full status when a user checks out, with user/time attribution and durable audit history.
- [ ] Make reset boundaries follow the organisation's local timezone; initial UK venue uses Europe/London. Preserve previous records rather than clearing history.

## Professional: prep lists

- [ ] Admins create prep lists and select dishes from that organisation's recipe library.
- [ ] Adding a dish adds each ingredient row to the prep list, preserving its quantity, notes and recipe provenance.
- [ ] Free-text notes area for instructions outside the usual prep items.
- [ ] Each item has two checkboxes: To do and Done.
- [ ] Store every prep list for audit purposes, preserving dated versions/status changes and attribution rather than overwriting history.
- [ ] Members access their own section's prep list. Admins can access any section's prep list within their organisation.
- [ ] Default to today's list for the member's section, with a date selector to move backward/forward.
- [ ] Allow future planning, including marking tomorrow's items To do.

## Decisions needed before implementing the professional workflows

- Are shift checklists shared per section, shared across the organisation, or individual to each member? Who defines the task templates?
- Does Check out create a personal snapshot or sign off a shared list? Can it happen multiple times, and can a signed-off list be edited? What is archived if nobody checks out before 03:00?
- Are To do and Done independent flags (planned and completed), or mutually exclusive states? Who may change them and prep notes?
- Should repeated ingredients from multiple dishes stay as separate rows, or be combined? Should admins choose batch quantities/recipe yield multipliers?
- What should unassigned members see when they have no section? The earlier optional-section requirement remains.
- Should the prep list date also use the 03:00 operational-day boundary, or calendar dates?

Commercial signup, subscriptions and billing are deferred.
