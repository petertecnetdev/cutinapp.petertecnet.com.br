import React, { useEffect } from "react";
import { apiBaseUrl, appSlug } from "../../config";

export default function LogoutPage() {
  useEffect(() => {
    let active = true;

    async function logout() {
      const token = localStorage.getItem("token");

      try {
        if (token) {
          await fetch(`${apiBaseUrl}/auth/logout`, {
            method: "POST",
            keepalive: true,
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
              "X-App-Slug": appSlug,
            },
          });
        }
      } catch (error) {
        console.warn("Não foi possível registrar o logout na API:", error);
      } finally {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("employer");
        if (active) window.location.replace("/login");
      }
    }

    logout();
    return () => { active = false };
  }, []);

  return null;
}
