import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, LockKeyhole, Snowflake } from 'lucide-react';
import { api } from './api';
import './account-pages.css';

type RegisterResult = { user: { email: string }; organization_id: string };

export function AccountPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organization, setOrganization] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setPending(true);
    try {
      if (mode === 'register') {
        const slug = organization.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!slug) throw new Error('Enter an organization name using letters or numbers.');
        const result = await api<RegisterResult>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, organization_name: organization.trim(), organization_slug: `${slug}-${crypto.randomUUID().slice(0, 8)}` }) });
        sessionStorage.setItem('chillpath_demo_identity', JSON.stringify({ email: result.user.email, organizationId: result.organization_id, organizationName: organization.trim() }));
      } else {
        await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        sessionStorage.setItem('chillpath_demo_identity', JSON.stringify({ email }));
      }
      navigate('/dashboard');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to continue. Please try again.'); }
    finally { setPending(false); }
  };

  return <div className="account-page"><div className="account-frame"><header><Link to="/" className="account-brand"><Snowflake size={22}/> CHILLPATH</Link><Link to="/billing">View plans <ArrowRight size={15}/></Link></header><div className="account-grid"><section className="account-story"><span className="account-eyebrow">COLD CHAIN COMMAND CENTER</span><h1>Every shipment<br/><em>has a better path.</em></h1><p>Monitor conditions, understand route risk, and help your team respond with confidence.</p><div className="account-story-list"><span><Check size={16}/> Temperature and sensor context</span><span><Check size={16}/> Route intelligence for India</span><span><Check size={16}/> Clear recovery decisions</span></div></section><section className="account-card"><div className="account-icon"><LockKeyhole size={22}/></div><span className="account-eyebrow">WELCOME TO CHILLPATH</span><h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2><p>{mode === 'login' ? 'Open the development dashboard.' : 'Create a development organization.'}</p><form onSubmit={submit}>{mode === 'register' && <label>Organization name<input value={organization} onChange={event => setOrganization(event.target.value)} autoComplete="organization" required maxLength={200} placeholder="Your company"/></label>}<label>Work email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required placeholder="you@company.com"/></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : undefined} required placeholder={mode === 'register' ? 'At least 12 characters' : 'Enter your password'}/></label>{error && <div className="account-error" role="alert">{error}</div>}<button type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button></form><div className="account-switch">{mode === 'login' ? <>New to ChillPath? <Link to="/signup">Create an account</Link></> : <>Already have an account? <Link to="/login">Sign in</Link></>}</div><small>Development access only. Persistent sessions and authorization are not enabled yet.</small></section></div></div></div>;
}

const PLANS = [
  { name: 'User', price: '₹10,000', cadence: 'one-time', points: ['For an individual operations user.', 'Explore shipment monitoring and route tools.', 'A simple starting option for one user.'], action: 'Get started' },
  { name: 'Industry collaboration', price: '₹1,00,000', cadence: 'collaboration', points: ['For an industry team or partner.', 'Plan a shared cold-chain workflow.', 'Discuss integration and rollout needs.'], action: 'Discuss collaboration' },
  { name: 'Subscription', price: '₹5,000', cadence: '/ month', points: ['Ongoing access for a team workspace.', 'Minimum term of 10 months.', 'Minimum commitment: ₹50,000.'], action: 'Choose subscription' },
];

export function BillingPage() {
  return <div className="billing-page"><header><Link to="/" className="account-brand"><Snowflake size={22}/> CHILLPATH</Link><Link to="/login">Sign in <ArrowRight size={15}/></Link></header><main><span className="account-eyebrow">CHILLPATH / PLANS</span><h1>Choose how you move forward.</h1><p className="billing-intro">Three straightforward options for getting started with cold-chain intelligence.</p><div className="billing-grid">{PLANS.map((plan, index) => <article className={index === 2 ? 'billing-card featured' : 'billing-card'} key={plan.name}><span className="billing-index">0{index + 1} / {plan.name.toUpperCase()}</span><h2>{plan.name}</h2><div className="billing-price">{plan.price}<small>{plan.cadence}</small></div><ul>{plan.points.map(point => <li key={point}><Check size={16}/>{point}</li>)}</ul><Link to="/signup">{plan.action}<ArrowRight size={16}/></Link></article>)}</div><p className="billing-note">Plans are informational. Online checkout and subscription activation are not available yet.</p></main></div>;
}
