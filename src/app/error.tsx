'use client';
import { Wordmark } from '@/components/ui';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="standalone"><Wordmark/><h1>A moment, please.</h1><p>This page could not load. The data provider may be unavailable.</p><button className="primary-button" onClick={reset}>Try again</button><a className="text-button" href="/">Back to explore</a></main>;}
