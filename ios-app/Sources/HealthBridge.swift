import Foundation
import HealthKit

/// Apple Health straight from the app (the «Madar-Health.ipa» build carries the HealthKit entitlement):
/// save a workout from the coach, read the newest weight (the Eufy scale writes it there).
/// Without the entitlement every call answers {ok:false} and the page uses its Shortcut instead.
final class HealthBridge {
    private let store = HKHealthStore()
    var emit: ((Any) -> Void)?

    private func authorize(_ done: @escaping (Bool, String) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else { done(false, "unavailable"); return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned), HKQuantityType(.distanceWalkingRunning)]
        let read: Set<HKObjectType> = [HKQuantityType(.bodyMass), HKQuantityType(.stepCount)]
        store.requestAuthorization(toShare: share, read: read) { ok, err in done(ok && err == nil, err?.localizedDescription ?? "") }
    }

    private static func activity(_ t: String) -> HKWorkoutActivityType {
        switch t {
        case "walking": return .walking
        case "running": return .running
        case "boxing": return .boxing
        case "eyes": return .mindAndBody
        default: return .traditionalStrengthTraining
        }
    }

    func saveWorkout(_ d: [String: Any]) {
        emit?(["stage": "asking"])
        authorize { ok, why in
            guard ok else { self.emit?(["ok": false, "error": why]); return }
            let minutes = (d["minutes"] as? NSNumber)?.doubleValue ?? 1
            let kcal = (d["kcal"] as? NSNumber)?.doubleValue ?? 0
            let km = (d["km"] as? NSNumber)?.doubleValue ?? 0
            let end = Date(), start = end.addingTimeInterval(-max(60, minutes * 60))
            let cfg = HKWorkoutConfiguration()
            cfg.activityType = Self.activity(d["type"] as? String ?? "")
            cfg.locationType = .indoor
            let b = HKWorkoutBuilder(healthStore: self.store, configuration: cfg, device: .local())
            b.beginCollection(withStart: start) { _, _ in
                var samples: [HKSample] = []
                if kcal > 0 { samples.append(HKQuantitySample(type: HKQuantityType(.activeEnergyBurned), quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal), start: start, end: end)) }
                if km > 0 { samples.append(HKQuantitySample(type: HKQuantityType(.distanceWalkingRunning), quantity: HKQuantity(unit: .meter(), doubleValue: km * 1000), start: start, end: end)) }
                let finish = {
                    b.endCollection(withEnd: end) { _, _ in
                        b.finishWorkout { w, e in self.emit?(["ok": w != nil, "saved": true, "error": e?.localizedDescription ?? ""]) }
                    }
                }
                if samples.isEmpty { finish() } else { b.add(samples) { _, _ in finish() } }
            }
        }
    }

    func readWeight() {
        emit?(["stage": "asking"])
        authorize { ok, why in
            guard ok else { self.emit?(["ok": false, "error": why]); return }
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let q = HKSampleQuery(sampleType: HKQuantityType(.bodyMass), predicate: nil, limit: 1, sortDescriptors: [sort]) { _, s, e in
                guard let x = s?.first as? HKQuantitySample else { self.emit?(["ok": false, "error": e?.localizedDescription ?? "no weight"]); return }
                self.emit?(["ok": true, "weight": x.quantity.doubleValue(for: .gramUnit(with: .kilo)), "at": x.endDate.timeIntervalSince1970 * 1000])
            }
            self.store.execute(q)
        }
    }
}
