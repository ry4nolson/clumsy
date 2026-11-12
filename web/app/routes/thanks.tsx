import type { Route } from "./+types/thanks";
import { DOWNLOAD, GITHUB } from "~/lib/links";
import { pageMeta } from "~/lib/meta";

export function meta(_args: Route.MetaArgs) {
  return [...pageMeta("Thank you · Clumsy", "Thanks for supporting Clumsy."), { name: "robots", content: "noindex" }];
}

export default function Thanks() {
  return (
    <main className="section thanks">
      <div className="section__inner thanks__inner">
        <img className="thanks__icon" src="/icon.png" alt="" width={96} height={96} />
        <h1 className="section__title">Thank you.</h1>
        <p className="section__body">
          You just paid for something you could have had for free. That keeps
          Clumsy free, open source, and moving. Stripe will email your receipt.
        </p>
        <div className="thanks__actions">
          <a className="btn btn--primary" href={DOWNLOAD}>
            Download Clumsy.dmg
          </a>
          <a className="btn btn--secondary" href={GITHUB}>
            View on GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
