# SCRAPMIND visual system

## Scene and theme

A maker works beside loose parts at a daylight bench, moving between the screen and physical objects. Warm light surfaces keep labels and observations legible; a deep green configuration map gives connected parts a clear focal point. This is a product workbench, not a marketing landing page.

## Color strategy

Restrained surfaces with purposeful green selection/action states and a distinct green map canvas. Implemented CSS tokens use OKLCH: paper `97% .012 86`, surface `99% .004 86`, ink `26% .025 164`, muted `47% .026 164`, lines `85% .019 86`, primary green `35% .06 164`, map accent `84% .13 119`, soft selection `93% .036 125`, warning `45% .09 59`, error `43% .14 28`. Tinted neutrals remain readable beside real object photos. Status is also conveyed with words and shape.

## Type

Native system sans for actions, labels, headings, and procedures; system monospace for small lab identifiers, units, and role numbers. Fixed rem sizes and compact labels. The main task heading is 2.5rem on desktop and 1.9rem on narrow screens. Procedure prose stays within 70ch. No external fonts are requested.

## Structure

Persistent top navigation for Workbench, Camera Lab, and Evidence. Desktop inventory rail, central configuration/build workflow, and a compact procedure list. Narrow layouts expose inventory through a labeled control and make procedure choices horizontally scrollable. The allocation map has its own scroll region on small screens. Evidence is organized by build rather than decorative statistics.

## Components and behavior

Use 4px control radii, thin tinted borders, explicit labels, clear focus, compact status tags, inline errors, and progressive details. Avoid nested cards and modal-first interaction. Source photos and frames accompany owner review. Destructive workspace replacement has an inline export-first choice. Busy operations disable conflicting edits while their stop controls remain usable. Errors preserve entered form data.

## Motion and accessibility

150–160ms action feedback conveys interaction, without decorative page choreography. Reduced-motion preferences disable animation/transitions and use immediate build navigation. Camera activation and model requests require explicit actions. Keyboard numeric crop controls accompany pointer corners. Aim for WCAG 2.2 AA; conformance has not been independently established.

## Source of truth

`web/style.css` contains the implemented tokens, responsive behavior, component states, and motion rules. `PRODUCT.md` records the user-confirmed strategy. Render and inspect changes in the actual workbench; retain tested software behavior and physical-evidence boundaries.
