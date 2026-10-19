import { useEffect, useState } from "react";

const thirdPartyUrl = `${import.meta.env.BASE_URL}third-party-licenses.txt`;

export function LicensesView({ license }: { license: string }) {
  const [thirdParty, setThirdParty] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(thirdPartyUrl)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((text) => {
        if (!cancelled) {
          setThirdParty(text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="about-licenses">
      <section>
        <h3>Clumsy</h3>
        <pre>{license.trim()}</pre>
      </section>
      <section>
        <h3>Third-party software</h3>
        {thirdParty ? (
          <pre>{thirdParty.trim()}</pre>
        ) : (
          <p className="changelog-empty">
            {failed ? "Third-party licenses are generated during the build (pnpm licenses)." : "Loading…"}
          </p>
        )}
      </section>
    </div>
  );
}
