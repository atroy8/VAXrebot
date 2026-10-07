                export const tools = {
                    vaccinate: { name: "💉 Vaccinate", description: "Protect susceptible individuals", availableDay: 2, oncePerPerson: true, baseDailyLimit: 5, validTargets: ["healthy"] },
                    quarantine: { name: "🚫 Quarantine", description: "Isolate any individual", availableDay: 3, oncePerPerson: true, baseDailyLimit: 3, validTargets: ["healthy", "infected", "recovered"] },
                    severLink: { name: "🔗 Sever Link", description: "Break a connection", availableDay: 1, oncePerPerson: false, baseDailyLimit: 3, validTargets: ["any"] }
                };
