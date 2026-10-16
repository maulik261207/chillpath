import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Snowflake } from './uiMarks';
import { api } from './api';
import { DEMO_EMAIL, signInAccount, signInDemo } from './authSession';
import './account-pages.css';

type RegisterResult = { user: { email: string }; organization_id: string };

function AccountBrand() {
  return <Link to="/" className="account-brand brand"><span className="brand-mark"><Snowflake size={20}/></span><span className="brand-text">Chill<span className="brand-light">Path</span></span></Link>;
}

export function AccountPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [organization, setOrganization] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setPending(true);
    try {
      if (mode === 'register') {
        const slug = organization.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!slug) throw new Error('Enter an organization name using letters or numbers.');
        await api<RegisterResult>('/auth/register', { method: 'POST', body: JSON.stringify({ email: identifier, password, organization_name: organization.trim(), organization_slug: `${slug}-${crypto.randomUUID().slice(0, 8)}` }) });
        navigate('/login', { replace: true, state: { message: 'Account created. Sign in to continue.' } });
        return;
      } else {
        if (identifier.trim().toLocaleLowerCase() === DEMO_EMAIL) {
          if (!signInDemo(identifier, password)) throw new Error('Incorrect demo password.');
        } else {
          if (!identifier.includes('@')) throw new Error('Enter a valid work email.');
          const account = await api<{ organization_name: string | null; organization_id: string | null }>('/auth/login', { method: 'POST', body: JSON.stringify({ email: identifier, password }) });
          signInAccount(identifier.trim(), account.organization_name, account.organization_id);
        }
      }
      const requestedPath = (location.state as { from?: string } | null)?.from;
      navigate(requestedPath?.startsWith('/') ? requestedPath : '/dashboard', { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to continue. Please try again.'); }
    finally { setPending(false); }
  };

  return <div className="account-page">
    <div className="account-frame">
      <header><AccountBrand/><Link to="/billing" className="account-access-link">Billing <ArrowRight size={15}/></Link></header>
      <div className="account-grid">
        <section className="account-story">
          <h1>Plan the route.<br/><em>Protect the Shipment.</em></h1>
          <p>Monitor conditions, understand route risk, and help your team respond with confidence.</p>
          <div className="account-story-list"><span><b>01</b> Temperature and sensor context</span><span><b>02</b> Route intelligence for India</span><span><b>03</b> Clear recovery decisions</span></div>
        </section>
        <section className="account-card">
          <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>
          <p>{mode === 'login' ? 'Continue to your ChillPath workspace.' : 'Set up your ChillPath workspace.'}</p>
          {(location.state as { message?: string } | null)?.message && <p className="account-notice">{(location.state as { message?: string }).message}</p>}
          <form onSubmit={submit}>
            {mode === 'register' && <label><span className="field-label">Organization name <span className="required-mark" aria-hidden="true">*</span></span><input value={organization} onChange={event => setOrganization(event.target.value)} autoComplete="organization" required maxLength={200}/></label>}
            <label><span className="field-label">Work email <span className="required-mark" aria-hidden="true">*</span></span><input type="email" value={identifier} onChange={event => setIdentifier(event.target.value)} autoComplete="email" required/></label>
            <label><span className="field-label">Password <span className="required-mark" aria-hidden="true">*</span></span>{mode === 'register' && <small>Use at least 12 characters.</small>}<span className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : undefined} required/><button className="password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? '◉' : '◌'}</button></span></label>
            {error && <div className="account-error" role="alert">{error}</div>}
            <button type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button>
          </form>
          <div className="account-switch">{mode === 'login' ? <>New to ChillPath? <Link to="/signup">Create an account</Link></> : <>Already have an account? <Link to="/login">Sign in</Link></>}</div>
          <small>By continuing, you agree to the <Link to="/terms">Terms of Service</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link>.</small>
        </section>
      </div>
    </div>
  </div>;
}

export function BillingPage() {
  const plans = [
    { code: 'user', name: 'User', price: '₹10,000', period: 'per user', points: ['For one individual operator.', 'Monitor shipments and sensor status.', 'Use route planning and recovery tools.'] },
    { code: 'industry_collaboration', name: 'Industry collaboration', price: '₹1,00,000', period: 'collaboration package', points: ['For an industry or logistics partner.', 'Plan a shared cold-chain workflow.', 'Scope sensor and system integration.'] },
    { code: 'subscription', name: 'Subscription', price: '₹5,000', period: 'per month · 10-month minimum', points: ['Ongoing access for a team workspace.', 'Minimum commitment: 10 months.', 'Total minimum: ₹50,000.'] },
  ];
  return <div className="billing-page"><header><AccountBrand/><Link to="/login">Sign in <ArrowRight size={15}/></Link></header><main><h1>Choose your plan.</h1><p className="billing-intro">Pick the way that fits your team and shipment workflow.</p><section className="billing-grid">{plans.map((plan, index) => <article className={`billing-card ${index === 2 ? 'featured' : ''}`} key={plan.code}><span className="billing-index">0{index + 1} / {plan.name.toUpperCase()}</span><h2>{plan.name}</h2><div className="billing-price">{plan.price}<small>{plan.period}</small></div><ul>{plan.points.map(point => <li key={point}><Check size={16}/>{point}</li>)}</ul><Link to="/signup">{index === 1 ? 'Discuss collaboration' : 'Get started'} <ArrowRight size={16}/></Link></article>)}</section></main></div>;
}
