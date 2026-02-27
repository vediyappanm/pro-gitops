async function runTests() {
    console.log('🚀 Starting Archon SaaS API Tests...\n');

    // 1. Test Health Check
    try {
        const res = await fetch('http://localhost:3000/');
        const text = await res.text();
        console.log('✅ Health Check:', text === 'Archon API is running!' ? 'PASSED' : 'FAILED');
    } catch (e) {
        console.error('❌ Health Check FAILED: Server might not be running on port 3000');
    }

    // 2. Test Auth Redirect
    try {
        const res = await fetch('http://localhost:3000/auth/github', { redirect: 'manual' });
        console.log('✅ Auth Redirect:', res.status === 302 ? 'PASSED' : 'FAILED');
    } catch (e) {
        console.error('❌ Auth Redirect FAILED');
    }

    // 3. Test Webhook Security
    try {
        const res = await fetch('http://localhost:3000/webhook/github', { method: 'POST' });
        console.log('✅ Webhook Security:', res.status === 401 ? 'PASSED (Unauthorized blocked)' : 'FAILED');
    } catch (e) {
        console.error('❌ Webhook Security FAILED');
    }

    // 4. Test Dashboard Auth Guard
    try {
        const res = await fetch('http://localhost:3000/dashboard/stats');
        console.log('✅ Dashboard Security:', res.status === 401 ? 'PASSED (Protected route blocked)' : 'FAILED');
    } catch (e) {
        console.error('❌ Dashboard Security FAILED');
    }

    console.log('\n✨ All basic server checks complete!');
}

runTests();
