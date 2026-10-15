import { Link } from 'react-router-dom';

const sections = {
  terms: [
    ['Using ChillPath', 'ChillPath is a decision-support prototype for route planning, shipment monitoring, sensor review, and recovery planning. You are responsible for verifying information before making transport, product-safety, compliance, or release decisions.'],
    ['Accounts and access', 'Keep account details accurate and protect access credentials. Development accounts may change or be removed as the service evolves.'],
    ['Acceptable use', 'Do not misuse the service, interfere with its operation, attempt unauthorized access, or submit unlawful content.'],
    ['Service availability', 'Prototype features, integrations, and data may change. We do not promise uninterrupted availability or fitness for a regulated decision.'],
    ['Contact', 'Questions about these terms can be sent to the ChillPath project team through the repository owner.'],
  ],
  privacy: [
    ['Information we handle', 'The prototype may process account details, organization information, shipment records, route points, sensor readings, and operator actions that you submit.'],
    ['How information is used', 'Information supports authentication, route planning, monitoring, recovery suggestions, system reliability, and development testing.'],
    ['Third-party services', 'Map requests may use Geoapify and MapTiler. Their services receive the technical request data required to provide maps and routes.'],
    ['Storage and security', 'Local development data may be stored in SQLite or PostgreSQL. API credentials belong in environment files and must not be committed to source control.'],
    ['Your choices', 'Do not submit sensitive production data to the prototype. Contact the project owner to request access, correction, or deletion of development data.'],
  ],
};

export default function LegalPage({ type }: { type: keyof typeof sections }) {
  const title = type === 'terms' ? 'Terms of Service' : 'Privacy Policy';
  return <div className="legal-page"><header><Link to="/" className="legal-brand">ChillPath</Link><nav><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/">Return home</Link></nav></header><main><p className="legal-kicker">CHILLPATH LEGAL</p><h1>{title}</h1><p className="legal-updated">Effective October 16, 2026</p><div className="legal-intro">This document applies to the ChillPath prototype and its development environment.</div>{sections[type].map(([heading,body],index)=><section key={heading}><span>{String(index+1).padStart(2,'0')}</span><div><h2>{heading}</h2><p>{body}</p></div></section>)}</main><footer><span>ChillPath prototype</span><Link to={type==='terms'?'/privacy':'/terms'}>{type==='terms'?'Read the Privacy Policy':'Read the Terms of Service'}</Link></footer></div>;
}
