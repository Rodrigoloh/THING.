# Charms

Charms are the shared visual identity of a Thing. The single registry in `src/features/things/model.ts` defines the key, label, SVG asset and default color for clover, cherry, moon, spark, flame, heart, dice, eye, mushroom, cloud, lightning and planet. Assets live under `public/charms/` and come from the supplied THING sticker sheet.

Either active member may propose a replacement. The current Charm remains visible until the other member accepts. The other member may decline, which deletes only the proposal. Acceptance updates the Charm atomically. When `color_source='charm'`, it also applies the registry color; a manual color is preserved.

The initial pending-Charm ritual uses the same proposal table and requires the other member to accept before activation.
