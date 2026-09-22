import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "../src/lib/i18n/provider.tsx";
import { AppHeader } from "../src/components/ui/app-header.tsx";
import { AvatarRenderer } from "../src/features/profile/avatar-renderer.tsx";
import {
  avatarKeys, avatarObjectPath, checkAvatarFile, hasImageSignature, initialsFor,
  maxAvatarBytes, resolveAvatarFields, validateAvatarFile,
} from "../src/features/profile/avatar.ts";
import { publicAvatarUrl } from "../src/features/profile/avatar-storage.ts";
import { submitOwnProfile } from "../src/features/profile/profile.ts";

function render(ui, locale = "en") {
  return renderToStaticMarkup(createElement(LocaleProvider, { initialLocale: locale }, ui));
}

test("eight stable SVG presets exist and the renderer supports presets, uploaded previews, and initials", () => {
  assert.equal(avatarKeys.length, 8);
  for (const key of avatarKeys) {
    const result = resolveAvatarFields("user-a", "preset", key, null);
    assert.deepEqual(result.fields, { avatar_type: "preset", avatar_key: key, avatar_url: null });
  }
  assert.match(render(createElement(AvatarRenderer, { name: "Ada Lovelace", type: "preset", keyName: "star_yellow" })), /avatars\/star_yellow\.svg/);
  assert.match(render(createElement(AvatarRenderer, { name: "Ada Lovelace", type: "upload", previewUrl: "blob:local-photo" })), /blob:local-photo/);
  assert.match(render(createElement(AvatarRenderer, { name: "Ada Lovelace", type: null })), /AL/);
  assert.equal(initialsFor("  Lucía Sol  ", "es"), "LS");
});

test("profile creation persists the last selected preset or upload path, never a forged path", async () => {
  function client() {
    let inserted;
    return {
      get inserted() { return inserted; },
      auth: { async getUser() { return { data: { user: { id: "user-a" } }, error: null }; } },
      from() { return { insert(row) {
        inserted = row;
        return { select() { return { async single() { return { data: row, error: null }; } }; } };
      } }; },
    };
  }
  const presetClient = client();
  const preset = await submitOwnProfile(presetClient, "Ada", "es", "preset", "blob_red", null);
  assert.equal(preset.profile.avatar_key, "blob_red");
  assert.equal(preset.profile.avatar_type, "preset");
  assert.equal(presetClient.inserted.avatar_url, null);

  const uploadClient = client();
  const path = avatarObjectPath("user-a");
  const upload = await submitOwnProfile(uploadClient, "Ada", "en", "upload", null, path);
  assert.equal(upload.profile.avatar_url, path);
  assert.equal(upload.profile.avatar_type, "upload");
  assert.equal(uploadClient.inserted.avatar_key, null);

  const forged = client();
  assert.equal((await submitOwnProfile(forged, "Ada", "en", "upload", null, "other-user/profile")).error, "avatarInvalid");
  assert.equal(forged.inserted, undefined);
  assert.equal(resolveAvatarFields("user-a", "preset", "not_a_preset", null).error, "avatarInvalid");
});

test("photo validation rejects wrong types, empty files, large files, and fake signatures", async () => {
  assert.equal(validateAvatarFile({ size: 42, type: "image/gif" }), "invalidPhotoType");
  assert.equal(validateAvatarFile({ size: maxAvatarBytes + 1, type: "image/png" }), "photoTooLarge");
  assert.equal(validateAvatarFile({ size: 0, type: "image/png" }), "invalidPhotoData");
  assert.equal(hasImageSignature(Uint8Array.from([0xff,0xd8,0xff,0x00]), "image/jpeg"), true);
  assert.equal(hasImageSignature(Uint8Array.from([137,80,78,71,13,10,26,10]), "image/png"), true);
  assert.equal(hasImageSignature(Uint8Array.from([82,73,70,70,0,0,0,0,87,69,66,80]), "image/webp"), true);
  assert.equal(hasImageSignature(Uint8Array.from([1,2,3,4]), "image/png"), false);
  assert.equal(await checkAvatarFile(new File(["not an image"], "fake.png", { type: "image/png" })), "invalidPhotoData");
  assert.equal(await checkAvatarFile(new File([Uint8Array.from([0xff,0xd8,0xff,0])], "okay.jpg", { type: "image/jpeg" })), null);
});

test("public photo URL is centrally resolved from the single user-scoped path", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://build-check.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_build_check_only";
    assert.match(publicAvatarUrl(avatarObjectPath("user-a")), /\/storage\/v1\/object\/public\/avatars\/user-a\/profile/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test("normal header contains no theme control; language remains independent of appearance", () => {
  for (const locale of ["en", "es"]) {
    const html = render(createElement(AppHeader), locale);
    assert.match(html, /THING\./);
    assert.doesNotMatch(html, /<select|Theme|Tema|theme-picker/);
  }
});