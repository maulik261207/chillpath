import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Snowflake } from './uiMarks';
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

  return <div className="account-page"><div className="account-frame"><header><Link to="/" className="account-brand"><Snowflake size={22}/> CHILLPATH</Link><Link to="/billing">Access options <ArrowRight size={15}/></Link></header><div className="account-grid"><section className="account-story"><h1>Plan the route.<br/><em>Protect the shipment.</em></h1><p>Monitor conditions, understand route risk, and help your team respond with confidence.</p><div className="account-story-list"><span><b>01</b> Temperature and sensor context</span><span><b>02</b> Route intelligence for India</span><span><b>03</b> Clear recovery decisions</span></div></section><section className="account-card"><div className="account-icon"><LockKeyhole size={22}/></div><h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2><p>{mode === 'login' ? 'Open the development dashboard.' : 'Create a development organization.'}</p><form onSubmit={submit}>{mode === 'register' && <label>Organization name<input value={organization} onChange={event => setOrganization(event.target.value)} autoComplete="organization" required maxLength={200}/></label>}<label>Work email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required/></label><label>Password {mode === 'register' && <small>Use at least 12 characters.</small>}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : undefined} required/></label>{error && <div className="account-error" role="alert">{error}</div>}<button type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button></form><div className="account-switch">{mode === 'login' ? <>New to ChillPath? <Link to="/signup">Create an account</Link></> : <>Already have an account? <Link to="/login">Sign in</Link></>}</div><small>By continuing, you agree to the <Link to="/terms">Terms of Service</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link>.</small></section></div></div></div>;
}

export function BillingPage() {
  return <div className="billing-page"><header><Link to="/" className="account-brand"><Snowflake size={22}/> CHILLPATH</Link><Link to="/login">Sign in <ArrowRight size={15}/></Link></header><main><h1>Start with a working pilot.</h1><p className="billing-intro">We scope access around your shipment volume, sensor setup, and route needs. One practical engagement replaces a wall of pricing tiers.</p><section className="billing-offer"><div><span className="billing-index">PILOT ACCESS</span><h2>Cold-chain operations workspace</h2><p>Includes route planning, shipment monitoring, sensor checks, recovery guidance, and an implementation review.</p></div><div className="billing-options"><p><b>Individual evaluation</b><span>Explore the complete workflow with demo data.</span></p><p><b>Team rollout</b><span>Connect a shared workspace and operating process.</span></p><p><b>Industry collaboration</b><span>Plan sensors, integrations, and deployment together.</span></p></div><Link to="/signup">Request access <ArrowRight size={16}/></Link></section><p className="billing-note">Access terms and pricing are confirmed after a short scope review. Online checkout is not available yet.</p></main></div>;
}
