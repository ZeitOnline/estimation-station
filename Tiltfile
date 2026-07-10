# =============================================================================
# Tiltfile  —  live local development against a real k8s cluster.
#
#   tilt up          (needs a local cluster: kind / minikube / docker-desktop)
#
# Tilt builds the images, applies k8s/devel, and gives you a dashboard at
# http://localhost:10350 . Edit a file and Tilt rebuilds/redeploys automatically.
# This is how the real ZEIT services (wally, merkl) are developed locally.
# =============================================================================

# Build the two images we own. postgres/postgrest use upstream images directly.
docker_build('app/migrator', '.', target='migrator')
docker_build('app/node', '.', target='node',
    live_update=[
        sync('./node', '/app'),   # copy changed files into the running container
    ])
# NOTE: the planning-poker realtime server is no longer its own image/workload —
# it now lives inside the SvelteKit app (frontend/, run with `npm run dev`).

# Apply the devel overlay (namespace `learn`, all 4 workloads).
k8s_yaml(kustomize('k8s/devel'))

# Wire up dependencies + port-forwards so you can reach things from your host.
k8s_resource('postgres', port_forwards='5432:5432')
k8s_resource('migrator', resource_deps=['postgres'])
k8s_resource('postgrest', resource_deps=['migrator'], port_forwards='3000:3000')
k8s_resource('node', resource_deps=['postgrest'], port_forwards='3001:3001')
