import type { CSSProperties } from 'react';

type MarkProps = {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  fill?: string;
  'aria-hidden'?: boolean;
};

function mark(label: string) {
  return function Mark({ size = 16, className = '', style }: MarkProps) {
    return <span className={`ui-mark ${className}`} style={{ '--mark-size': typeof size === 'number' ? `${size}px` : size, ...style } as CSSProperties} aria-hidden="true">{label}</span>;
  };
}

export const Activity = mark('AC');
export const AlertTriangle = mark('!');
export const ArrowLeft = mark('←');
export const ArrowRight = mark('→');
export const ArrowUpRight = mark('↗');
export const Box = mark('BX');
export const Bus = mark('BUS');
export const Check = mark('OK');
export const ChevronDown = mark('⌄');
export const CircleHelp = mark('?');
export const Clock3 = mark('TM');
export const Compass = mark('CP');
export const Cpu = mark('EN');
export const Database = mark('DB');
export const Gauge = mark('GA');
export const LayoutDashboard = mark('OV');
export const LocateFixed = mark('LOC');
export const LockKeyhole = mark('SEC');
export const MapPin = mark('PIN');
export const Menu = mark('MENU');
export const Minus = mark('−');
export const Navigation = mark('NAV');
export const Package = mark('PK');
export const Pause = mark('II');
export const Play = mark('▶');
export const Plus = mark('+');
export const Radio = mark('SN');
export const RefreshCw = mark('↻');
export const RotateCcw = mark('↺');
export const Route = mark('RT');
export const Search = mark('FIND');
export const ShieldCheck = mark('SAFE');
export const Snowflake = mark('CP');
export const Thermometer = mark('TMP');
export const Truck = mark('TRK');
export const Wifi = mark('ON');
export const WifiOff = mark('OFF');
export const X = mark('×');
