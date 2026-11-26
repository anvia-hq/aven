import AvenKit
import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case threads
    case projects
    case cockpit
    case bots
    case git
    case automations
    case settings

    var id: String { rawValue }

    static var primary: [AppSection] {
        [.threads, .projects, .cockpit, .bots, .git, .automations]
    }

    var title: String {
        switch self {
        case .threads: return "Threads"
        case .projects: return "Projects"
        case .cockpit: return "Cockpit"
        case .bots: return "Bots"
        case .git: return "Git Center"
        case .automations: return "Automations"
        case .settings: return "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .threads: return "bubble.left.and.bubble.right"
        case .projects: return "folder"
        case .cockpit: return "square.grid.2x2"
        case .bots: return "sparkles"
        case .git: return "arrow.triangle.branch"
        case .automations: return "bolt"
        case .settings: return "gearshape"
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var section: AppSection = .threads
    @State private var threadPath: [String] = []
    @State private var isSidebarOpen = false
    @State private var dragOffset: CGFloat = 0
    @State private var showNewThread = false
    @State private var newThreadProjectId: String?

    private let spring = Animation.spring(response: 0.28, dampingFraction: 0.92)

    var body: some View {
        GeometryReader { geometry in
            let drawerWidth = min(geometry.size.width * 0.84, 320)
            let closedOffset = -drawerWidth
            let currentOffset = isSidebarOpen
                ? min(0, dragOffset)
                : min(0, closedOffset + max(0, dragOffset))
            let progress = max(0, min(1, 1 + currentOffset / drawerWidth))

            ZStack(alignment: .leading) {
                content
                    .disabled(isSidebarOpen)

                if !isSidebarOpen && threadPath.isEmpty {
                    Color.clear
                        .frame(width: 22)
                        .contentShape(Rectangle())
                        .gesture(edgeOpenGesture(drawerWidth: drawerWidth))
                }

                if progress > 0.001 {
                    Color.black
                        .opacity(0.48 * progress)
                        .ignoresSafeArea()
                        .onTapGesture { closeSidebar() }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel("Close sidebar")
                }

                SidebarView(
                    section: section,
                    activeThreadId: section == .threads ? threadPath.last : nil,
                    onSelectSection: { chosen in
                        section = chosen
                        if chosen != .threads {
                            threadPath = []
                        }
                        closeSidebar()
                    },
                    onSelectThread: { threadId in
                        section = .threads
                        threadPath = [threadId]
                        closeSidebar()
                    },
                    onNewThread: {
                        closeSidebar()
                        newThreadProjectId = nil
                        showNewThread = true
                    },
                    onClose: { closeSidebar() }
                )
                .frame(width: drawerWidth)
                .offset(x: currentOffset)
                .shadow(color: .black.opacity(0.35 * progress), radius: 18, x: 4, y: 0)
                .gesture(drawerCloseGesture(drawerWidth: drawerWidth))
            }
        }
        .sheet(isPresented: $showNewThread) {
            NewThreadSheet(initialProjectId: newThreadProjectId) { created in
                section = .threads
                threadPath = [created.id]
            }
        }
        .task {
            while !Task.isCancelled {
                await model.refresh()
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch section {
        case .threads:
            ThreadListView(
                path: $threadPath,
                onOpenSidebar: openSidebar,
                onNewThread: {
                    newThreadProjectId = nil
                    showNewThread = true
                }
            )
        case .projects:
            ProjectsView(
                onOpenSidebar: openSidebar,
                onOpenThread: { threadId in
                    section = .threads
                    threadPath = [threadId]
                },
                onNewThreadInProject: { projectId in
                    newThreadProjectId = projectId
                    showNewThread = true
                }
            )
        case .cockpit:
            CockpitView(onOpenSidebar: openSidebar)
        case .bots:
            BotsView(onOpenSidebar: openSidebar)
        case .git:
            GitCenterView(onOpenSidebar: openSidebar)
        case .automations:
            AutomationsView(onOpenSidebar: openSidebar)
        case .settings:
            SettingsView(onOpenSidebar: openSidebar)
        }
    }

    private func edgeOpenGesture(drawerWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .local)
            .onChanged { value in
                guard value.translation.width > 0 else { return }
                dragOffset = min(drawerWidth, value.translation.width)
            }
            .onEnded { value in
                let threshold = drawerWidth * 0.28
                let shouldOpen = value.translation.width > threshold
                    || value.predictedEndTranslation.width > threshold
                withAnimation(spring) {
                    isSidebarOpen = shouldOpen
                    dragOffset = 0
                }
            }
    }

    private func drawerCloseGesture(drawerWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .local)
            .onChanged { value in
                guard isSidebarOpen, abs(value.translation.width) > abs(value.translation.height) else {
                    return
                }
                dragOffset = min(0, value.translation.width)
            }
            .onEnded { value in
                guard isSidebarOpen else { return }
                let threshold = drawerWidth * 0.28
                let shouldClose = value.translation.width < -threshold
                    || value.predictedEndTranslation.width < -threshold
                withAnimation(spring) {
                    isSidebarOpen = !shouldClose
                    dragOffset = 0
                }
            }
    }

    private func openSidebar() {
        withAnimation(spring) {
            isSidebarOpen = true
            dragOffset = 0
        }
    }

    private func closeSidebar() {
        withAnimation(spring) {
            isSidebarOpen = false
            dragOffset = 0
        }
    }
}
