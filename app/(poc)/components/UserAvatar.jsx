"use client";

import { useState } from "react";
import { FiUser } from "react-icons/fi";

// Profile picture for the signed-in user. Google accounts carry a `avatar`
// URL from their ID token; password accounts have none, so we fall back to the
// gradient initial the app used before avatars existed.
//
// Google's CDN occasionally 403s a picture URL (revoked photo, rate limit), so
// a broken image drops back to the same initial rather than showing the
// browser's broken-image glyph.
// `rounded` is a full Tailwind class rather than a modifier because two
// classes of the same property would collide unpredictably — the caller picks
// one shape outright (circle in the navbar, squircle on the profile header).
export default function UserAvatar({
  user,
  size = 32,
  rounded = "rounded-full",
  className = "",
}) {
  const [failed, setFailed] = useState(false);

  const initial = user?.name?.[0]?.toUpperCase();
  const showImage = Boolean(user?.avatar) && !failed;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 font-bold text-white ${rounded} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {showImage ? (
        <img
          src={user.avatar}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initial ?? <FiUser style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </span>
  );
}
