import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';

export default function TestTldraw() {
    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <Tldraw persistenceKey={null} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} />
        </div>
    );
}
