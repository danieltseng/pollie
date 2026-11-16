# Naming

- English, sentence case: `Profile header`, not `Profile Header` or `profile header`. Proper nouns and acronyms keep their case (`iOS`).
- Name layers by role, never keep default or vague names: no `Frame 12`, `Group 3`, `Rectangle 5`, `Vector`, `Container`, `Stack`.
- Text layers are named by role (`Title`, `Price`, `Helper text`), never by the text they show.
- Separator between parts: ` - ` (space, hyphen, space).
- Instances: `Component - Purpose`, using only the last segment of the component name (`List/Contact row` → `Contact row - Favorites`). No variant, state or device in the name. Leave out the purpose when it's obvious or comes from data.
- Icons: `Icon - Purpose`, named by function, not shape (`Icon - Delete`, not `Icon - Trash`).
- Screens (top-level frames): `Feature_State`, e.g. `Checkout_Empty`.
