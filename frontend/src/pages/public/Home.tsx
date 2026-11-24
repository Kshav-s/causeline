import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Database, FileBarChart2 } from "lucide-react";
import { ProvenanceBadge, PROVENANCE_LEGEND } from "../../components/ui/ProvenanceBadge";
import { Hero } from "../../components/public/Hero";
import { ClosedLoop } from "../../components/public/ClosedLoop";
import { Features, Journey, Platform, ProductTour, RegisterSection, WhyCauseLine } from "../../components/public/Sections";
import { delay, Eyebrow, SectionTitle } from "../../components/public/bits";
import { useReveal } from "../../hooks/useMotion";
import { cx } from "../../utils/format";

const FAQ = [
  ["Is the data in the demo real?", "No. The demonstration environment uses the synthetic ABT CPD dataset supplied with the project. Every screen marks it as demo data, and no figure should be read as real company performance."],
  ["Does the AI decide the root cause?", "No. Model outputs are labelled as predictions or possible explanations. Only a person can confirm a category or a root cause, and that confirmation is stored separately with their name."],
  ["How reliable are the predictions?", "Each model publishes its evaluation and limits inside the product. For example, the complaint classifier was trained on templated synthetic text and is uncertain on free-form wording, and the batch-risk model has weak predictive signal. The interface shows that uncertainty rather than hiding it."],
  ["Do I need an account to raise a complaint?", "No. Anyone can raise a complaint and attach photos. You receive a reference number and a private access key; keep both to view your complaint and its analysis later. Other visitors cannot see your details."],
  ["Does the AI look at my photos?", "No. Photos are stored as supporting evidence for the quality team. The AI analyses the written description only."],
  ["Is complaint data sent to outside AI services?", "No. All models run inside the CauseLine backend. Nothing is sent to an external AI provider."],
];

const AI_TEXT: Record<string, string> = {
  recorded: "Taken directly from a source record.", rule: "Deterministic calculation with a published rule.", nlp: "Text classification by a registered NLP model.",
  model: "Output of a registered ML model - a hypothesis.", similarity: "Retrieved because the wording is similar.", historical: "Pre-computed by the supplied ML package.",
  human: "Confirmed or corrected by a named person.", insufficient: "Not enough data to answer - no guess is made.", demo: "Synthetic demonstration data.",
};

export default function Home() {
  const [faq, setFaq] = useState<number | null>(0);
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Hero />
      <WhyCauseLine />
      <ClosedLoop />
      <Journey />
      <Platform />
      <ProductTour />
      <RegisterSection />
      <Features />

      {/* AI explainer */}
      <section id="ai" className="bg-surface py-28 max-md:py-20 scroll-mt-16">
        <div className="max-w-[1200px] mx-auto px-5 grid gap-12 lg:grid-cols-[1fr_1.15fr] items-start">
          <div className="reveal lg:sticky lg:top-28">
            <Eyebrow>How we treat AI output</Eyebrow>
            <SectionTitle>A prediction is never shown as a fact</SectionTitle>
            <p className="mt-4 text-[17px] leading-7 text-ink-2 max-w-xl">Every value in CauseLine carries a label for where it came from. Machine output uses a dashed outline; recorded and verified values are solid. Uncertainty, model version and known limits are shown next to each result.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PROVENANCE_LEGEND.map((k, i) => (
              <li key={k} className="reveal rounded-xl border border-line bg-surface p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-22px_rgba(11,17,23,0.5)]" style={delay(i * 50)}>
                <ProvenanceBadge kind={k} />
                <p className="text-[14px] leading-[21px] text-ink-2 mt-2.5">{AI_TEXT[k]}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-canvas py-28 max-md:py-20 scroll-mt-16">
        <div className="max-w-[820px] mx-auto px-5">
          <div className="text-center"><Eyebrow center>FAQ</Eyebrow><SectionTitle>Questions worth asking</SectionTitle></div>
          <div className="mt-10 space-y-2.5">
            {FAQ.map(([q, a], i) => (
              <div key={q} className={cx("rounded-xl border bg-surface transition-colors", faq === i ? "border-petrol-400" : "border-line")}>
                <button aria-expanded={faq === i} onClick={() => setFaq(faq === i ? null : i)} className="w-full flex items-center justify-between gap-3 px-5 min-h-14 py-3.5 text-left text-[17px] font-semibold text-ink">
                  {q}<ChevronDown className={cx("size-5 shrink-0 text-muted transition-transform duration-300", faq === i && "rotate-180 text-link")} />
                </button>
                <div className={cx("grid transition-[grid-template-rows] duration-300", faq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <p className="overflow-hidden px-5 text-[15.5px] leading-[26px] text-ink-2" aria-hidden={faq !== i}><span className="block pb-5">{a}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-graphite-900 grid-texture text-white py-24 max-md:py-20">
        <div className="reveal max-w-[780px] mx-auto px-5 text-center">
          <h2 className="text-[42px] leading-[50px] max-md:text-[31px] max-md:leading-[39px] font-bold tracking-[-0.022em]">Found a problem with a product?</h2>
          <p className="mt-4 text-[17px] leading-7 text-graphite-300">Raise a complaint in a few minutes - no account needed. Attach photos, get a reference number straight away, and see how our AI classifies it.</p>
          <div className="mt-8 flex justify-center flex-wrap gap-3">
            <Link to="/raise" className="cta cta-primary h-12 px-6 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-petrol-500 hover:bg-petrol-600 text-[16px] font-semibold">Raise a Complaint <ArrowRight className="cta-arrow size-4" /></Link>
            <Link to="/track" className="cta cta-ghost h-12 px-6 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-white/25 hover:bg-white/10 text-[16px] font-semibold"><Database className="size-4" />Track a complaint</Link>
          </div>
          <p className="mt-5 text-[13px] text-graphite-500 flex items-center justify-center gap-1.5"><FileBarChart2 className="size-3.5" />No statistics on this page are about real customers.</p>
        </div>
      </section>
    </div>
  );
}
