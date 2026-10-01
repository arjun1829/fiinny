import type { Metadata } from "next";
import Link from "next/link";
import { Clause, LegalDoc, Points } from "../../components/shared/legal-doc";
import { COMPANY, LEGAL_ROUTES, SITE_URL } from "../lib/legal";

/**
 * Return & Exchange Policy — the standalone statement of the platform position.
 *
 * WHY IT IS ITS OWN PAGE
 * ----------------------
 * Google Merchant Center asks for one URL "where your return policy can be read
 * by customers" and fetches it during verification. Clause 8 of /terms covers
 * the same ground, but it has no anchor and sits inside a long agreement, so a
 * reviewer would have to scroll to find it. This page says the same thing on
 * its own, in the order a buyer asks the questions.
 *
 * IT MUST NOT CONTRADICT /terms CLAUSE 8 OR /seller-terms CLAUSE 14. Those
 * documents devolve returns to the seller of record; this page states the
 * platform-wide position that no returns or exchanges are offered. If the
 * commercial position changes, all three change together — a return policy that
 * disagrees with the terms of sale is worse than none, both for a buyer and for
 * a Merchant Center review.
 */
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Return & Exchange Policy — KrishiDukan" },
  description:
    "KrishiDukan does not offer returns or exchanges on delivered agricultural inputs. How cancellations, undelivered orders and incorrect or damaged goods are handled.",
  alternates: { canonical: LEGAL_ROUTES.returns },
  openGraph: {
    type: "website",
    siteName: "KrishiDukan",
    url: `${SITE_URL}${LEGAL_ROUTES.returns}`,
    title: "Return & Exchange Policy — KrishiDukan",
    description:
      "KrishiDukan does not offer returns or exchanges on delivered agricultural inputs.",
  },
};

export default function ReturnPolicyPage() {
  return (
    <LegalDoc
      title="Return & Exchange Policy"
      route={LEGAL_ROUTES.returns}
      intro={
        <>
          <strong className="text-on-surface">
            {COMPANY.brand} does not offer returns or exchanges.
          </strong>{" "}
          Once an order has been delivered, it cannot be returned for a refund or
          exchanged for another product. Please read the product label, pack size and
          quantity carefully before you place an order. This policy forms part of the{" "}
          <Link
            href={LEGAL_ROUTES.terms}
            className="font-semibold text-primary hover:underline"
          >
            Terms &amp; Conditions
          </Link>
          .
        </>
      }
    >
      <Clause n={1} title="No returns">
        <p>
          We do not accept returns of delivered goods. This applies whether or not the
          packaging has been opened, and regardless of the reason — including a change of
          mind, an order placed for the wrong crop, season or acreage, or a product that
          did not produce the result you expected.
        </p>
        <p>
          Agricultural inputs are the reason for this. Seeds, fertilizers, pesticides and
          biologicals are sensitive to heat, moisture, sunlight and handling, and once a
          pack has left the seller&rsquo;s premises there is no way to establish how it was
          stored or transported. A returned input cannot responsibly be sold on to another
          farmer, and a product whose storage history is unknown is a risk to the crop it
          is next used on.
        </p>
      </Clause>

      <Clause n={2} title="No exchanges">
        <p>
          We do not exchange a delivered product for a different product, a different pack
          size, or a different quantity. If you need something else, please place a new
          order.
        </p>
      </Clause>

      <Clause n={3} title="Cancelling before dispatch">
        <p>
          An order can be cancelled at any time before the seller has dispatched it, by
          contacting the seller through the Platform. Where you have already paid online,
          the amount is refunded to the original payment method.
        </p>
        <p>
          Once an order has been dispatched it cannot be cancelled, and the no-return
          position in clause 1 applies from that point.
        </p>
      </Clause>

      <Clause n={4} title="Orders that are never fulfilled">
        <p>
          This is not a return, and it is the one case where money comes back to you after
          an order is placed. Where a seller rejects an order, cannot fulfil it, or the
          order is never delivered to you, the amount paid is refunded in full.
        </p>
      </Clause>

      <Clause n={5} title="Goods that are damaged, incorrect or expired on delivery">
        <p>
          Nothing in this policy takes away a right you have under Indian law that cannot
          be excluded by agreement. If what arrives is not what was ordered — a different
          product, an expired or clearly damaged pack, or goods that do not match their
          description — that is not a return, and the no-return position does not apply
          to it.
        </p>
        <Points
          items={[
            "Report it to the seller through the Platform on the day of delivery, before the pack is opened or used.",
            "Keep the goods, the packaging and the invoice as delivered. A pack that has been opened or used cannot be assessed.",
            "The seller is the seller of record and resolves the matter directly, in accordance with applicable law.",
            <>
              If you cannot resolve it with the seller, write to us at{" "}
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="font-semibold text-primary hover:underline"
              >
                {COMPANY.supportEmail}
              </a>{" "}
              with your order number and photographs of what you received.
            </>,
          ]}
        />
      </Clause>

      <Clause n={6} title="How refunds are paid">
        <p>
          Where a refund is due under clause 3 or clause 4, it is made to the original
          payment method used for the order. We do not pay refunds in cash, to a different
          account, or as credit on the Platform.
        </p>
        <p>
          The time a refund takes to reach you is determined by the payment service
          provider and your bank, not by {COMPANY.brand}.
        </p>
      </Clause>

      <Clause n={7} title="Who sells to you">
        <p>
          Every order on {COMPANY.brand} is sold and dispatched by an independent seller,
          not by {COMPANY.brand}. The seller is the seller of record and is responsible for
          packing, dispatch and delivery — see clause 8 of the{" "}
          <Link
            href={LEGAL_ROUTES.terms}
            className="font-semibold text-primary hover:underline"
          >
            Terms &amp; Conditions
          </Link>{" "}
          and clause 14 of the{" "}
          <Link
            href={LEGAL_ROUTES.sellerTerms}
            className="font-semibold text-primary hover:underline"
          >
            Seller &amp; Manufacturer Subscription Terms
          </Link>
          . A seller may not offer terms more restrictive than this policy.
        </p>
      </Clause>

      <Clause n={8} title="Questions">
        <p>
          Write to{" "}
          <a
            href={`mailto:${COMPANY.supportEmail}`}
            className="font-semibold text-primary hover:underline"
          >
            {COMPANY.supportEmail}
          </a>{" "}
          with your order number and we will help.
        </p>
      </Clause>
    </LegalDoc>
  );
}
