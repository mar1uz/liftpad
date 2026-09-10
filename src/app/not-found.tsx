import Link from 'next/link';
import { Wordmark } from '@/components/ui';
export default function NotFound(){return <main className="standalone"><Wordmark/><h1>A little off the path.</h1><p>This token or page could not be found.</p><Link href="/" className="primary-button">Back to explore ↗</Link></main>;}
