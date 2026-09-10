import {createHmac,timingSafeEqual} from 'node:crypto';
export function validWebhook(body:string,timestamp:string,signature:string,secret:string,now=Date.now()):boolean{
 if(!/^\d{10,13}$/.test(timestamp)||!/^sha256=[a-f0-9]{64}$/.test(signature)||secret.length<32)return false;
 const time=Number(timestamp)*(timestamp.length===10?1000:1);if(Math.abs(now-time)>300000)return false;
 const expected=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest();const received=Buffer.from(signature.slice(7),'hex');
 return expected.length===received.length&&timingSafeEqual(expected,received);
}
