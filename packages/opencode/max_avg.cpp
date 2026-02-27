#include <iostream>
#include <vector>
#include <limits>
#include <iomanip>

using namespace std;

int main() {
    int n, k;
    cin >> n >> k;
    vector<int> a(n);
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
    }

    vector<long long> prefix(n + 1, 0);
    for (int i = 0; i < n; ++i) {
        prefix[i + 1] = prefix[i] + a[i];
    }

    double max_avg = -numeric_limits<double>::infinity();

    for (int L = k; L <= n; ++L) {
        for (int i = 0; i <= n - L; ++i) {
            long long sum = prefix[i + L] - prefix[i];
            double avg = static_cast<double>(sum) / L;
            if (avg > max_avg) {
                max_avg = avg;
            }
        }
    }

    cout << fixed << setprecision(15) << max_avg << endl;

    return 0;
}