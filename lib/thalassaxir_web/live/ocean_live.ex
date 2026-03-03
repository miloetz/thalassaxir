defmodule ThalassaxirWeb.OceanLive do
  use ThalassaxirWeb, :live_view

  alias Thalassaxir.Ocean.{Session, SessionSupervisor}
  alias Phoenix.PubSub

  @pubsub Thalassaxir.PubSub
  @max_logs 30
  @stats_interval 500
  @chaos_interval 200
  @max_particles 200

  @impl true
  def mount(_params, _session, socket) do
    # Generate session ID only once (persists across SSR and connected mounts)
    socket = assign_new(socket, :session_id, fn -> generate_session_id() end)
    session_id = socket.assigns.session_id

    {particle_count, stats} =
      if connected?(socket) do
        # Create the session and subscribe to its events
        {:ok, ^session_id} = SessionSupervisor.get_or_create_session(session_id)
        PubSub.subscribe(@pubsub, Session.pubsub_topic(session_id))
        :timer.send_interval(@stats_interval, self(), :update_stats)

        {Session.count_particles(session_id), get_beam_stats(session_id)}
      else
        # Server-side render - no session yet
        {0, default_stats()}
      end

    socket =
      socket
      |> assign(:particle_count, particle_count)
      |> assign(:max_particles, @max_particles)
      |> assign(:spawn_count, 10)
      |> assign(:logs, [])
      |> assign(:chaos_mode, false)
      |> assign(:stats, stats)
      |> assign(:theme, :pirate)
      |> assign(:restart_count, 0)
      |> assign(:show_info, false)

    {:ok, socket, layout: false}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="ocean-container" data-theme={@theme}>
      <!-- Three.js Canvas -->
      <div
        id="ocean-canvas"
        phx-hook="OceanHook"
        phx-update="ignore"
        class="absolute inset-0 z-0"
        data-session-id={@session_id}
      >
      </div>

      <!-- Scrolling Process Logs -->
      <div class="absolute left-8 bottom-20 w-[400px] max-h-[50vh] overflow-hidden pointer-events-none select-none z-10 mask-gradient">
        <div class="flex flex-col-reverse gap-0.5">
          <%= for log <- @logs do %>
            <div class="log-entry text-[9px] font-mono whitespace-nowrap leading-relaxed">
              {log}
            </div>
          <% end %>
        </div>
      </div>

      <!-- Stats Overlay -->
      <div class="absolute top-6 left-6 z-20">
        <div
          class="mt-4 text-[10px] font-mono space-y-0.5"
          style={"color: #{health_color(@stats.health)}80;"}
        >
          <div>{@stats.process_count} proc</div>
          <div>{@stats.memory_mb} MB</div>
          <div>{@stats.uptime}</div>
        </div>
      </div>

      <!-- Control Panel -->
      <div class="ocean-panel absolute top-6 right-6 w-72 p-5 rounded-lg z-20">
        <div class="text-center mb-4">
          <div class="text-5xl font-light opacity-90">{@particle_count}</div>
          <div class="text-xs opacity-50 tracking-widest uppercase mt-1">ships</div>
        </div>

        <div class="flex justify-center gap-6 mb-4 text-center">
          <div>
            <div class="text-2xl font-light text-black">{@restart_count}</div>
            <div class="text-[10px] opacity-50 tracking-wider uppercase">repairs</div>
          </div>
          <div>
            <div class="text-2xl font-light text-black">{@max_particles - @particle_count}</div>
            <div class="text-[10px] opacity-50 tracking-wider uppercase">capacity</div>
          </div>
        </div>

        <div class="ocean-divider my-4"></div>

        <div class="space-y-3">
          <form phx-submit="spawn_particles" class="flex gap-2 items-center justify-center">
            <button type="button" phx-click="adjust_count" phx-value-delta="-10" class="ocean-btn w-8 h-8">
              -
            </button>
            <input
              type="number"
              name="count"
              value={@spawn_count}
              min="1"
              max="50"
              class="ocean-input w-16 px-1 py-1"
            />
            <button type="button" phx-click="adjust_count" phx-value-delta="10" class="ocean-btn w-8 h-8">
              +
            </button>
            <button type="submit" class="ocean-btn ml-2">
              Spawn
            </button>
          </form>

          <div class="flex gap-3 justify-center">
            <button type="button" phx-click="kill_random" class="ocean-btn flex-1 py-2">
              Sink
            </button>
            <button type="button" phx-click="storm_random" class="ocean-btn flex-1 py-2">
              Storm
            </button>
          </div>

          <div class="text-[10px] text-center opacity-40 leading-relaxed">
            Sink = gone forever | Storm = supervisor repairs
          </div>
        </div>

        <div class="ocean-divider my-4"></div>

        <div class="flex gap-3">
          <button
            phx-click="toggle_chaos"
            class={["flex-1 py-2 rounded transition-colors", if(@chaos_mode, do: "bg-red-500/20 text-red-400 border border-red-500/30", else: "ocean-btn")]}
          >
            {if @chaos_mode, do: "Chaos ON", else: "Chaos"}
          </button>
          <button phx-click="kill_all" class="ocean-btn flex-1 py-2">
            Sink All
          </button>
        </div>

        <div class="ocean-divider my-4"></div>

        <button phx-click="toggle_theme" class="ocean-btn w-full py-2">
          {if @theme == :pirate, do: "Modern Theme", else: "Pirate Theme"}
        </button>
      </div>

      <!-- Info Button -->
      <button
        phx-click="toggle_info"
        class="absolute top-6 right-[340px] w-8 h-8 rounded-full ocean-panel flex items-center justify-center z-20 opacity-60 hover:opacity-100 transition-opacity"
      >
        <span class="text-sm font-serif italic">i</span>
      </button>

      <!-- Info Dialog -->
      <%= if @show_info do %>
        <div class="absolute inset-0 z-30 flex items-center justify-center bg-black/50" phx-click="toggle_info">
          <div class="ocean-panel max-w-md p-6 rounded-lg m-4" phx-click-away="toggle_info">
            <h2 class="text-xl font-light mb-4 tracking-wide">Your Private Ocean</h2>
            <div class="space-y-3 text-sm opacity-80 leading-relaxed">
              <p>
                Each ship is a real <strong>Elixir process</strong> (GenServer) running on the BEAM virtual machine.
                This is your private ocean — other visitors have their own fleet.
              </p>
              <p>
                <strong>Spawn</strong> creates new processes.
                <strong>Sink</strong> terminates them permanently — watch them go under.
              </p>
              <p>
                <strong>Storm</strong> sends a message that makes ships spin out of control.
                The process stays alive, just disoriented.
              </p>
              <p>
                <strong>Chaos</strong> mode randomly storms and sinks ships.
                <strong>Sink All</strong> terminates your entire fleet.
              </p>
              <p>
                You can have up to {@max_particles} ships. Each one is isolated,
                lightweight, and managed by Elixir's supervision tree.
              </p>
              <p class="opacity-60 text-xs pt-2">
                Built with Elixir, Phoenix LiveView, and Three.js
              </p>
            </div>
            <button phx-click="toggle_info" class="ocean-btn mt-4 w-full py-2">
              Close
            </button>
          </div>
        </div>
      <% end %>

      <!-- Title -->
      <div class="ocean-title absolute bottom-6 left-6 z-20">
        <div class="text-lg font-light tracking-[0.3em] uppercase">thalassaxir</div>
        <div class="text-[10px] tracking-wider">your private ocean</div>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("spawn_particle", _params, socket) do
    Session.spawn_particle(socket.assigns.session_id)
    {:noreply, socket}
  end

  @impl true
  def handle_event("adjust_count", %{"delta" => delta}, socket) do
    delta = String.to_integer(delta)
    new_count = max(1, socket.assigns.spawn_count + delta)
    {:noreply, assign(socket, :spawn_count, min(50, new_count))}
  end

  @impl true
  def handle_event("spawn_particles", %{"count" => count}, socket) do
    count = String.to_integer(count) |> min(50)
    Session.spawn_particles(socket.assigns.session_id, count)
    {:noreply, assign(socket, :spawn_count, count)}
  end

  @impl true
  def handle_event("toggle_chaos", _params, socket) do
    chaos_mode = !socket.assigns.chaos_mode

    if chaos_mode do
      :timer.send_interval(@chaos_interval, self(), :chaos_tick)
    end

    {:noreply, assign(socket, :chaos_mode, chaos_mode)}
  end

  @impl true
  def handle_event("kill_random", _params, socket) do
    session_id = socket.assigns.session_id
    IO.puts("kill_random: session=#{session_id}")
    result = Session.kill_random_particle(session_id)
    IO.inspect(result, label: "kill_random result")
    {:noreply, socket}
  end

  @impl true
  def handle_event("storm_random", _params, socket) do
    session_id = socket.assigns.session_id
    count = Session.count_particles(session_id)

    if count > 0 do
      storm_count = min(3, max(1, div(count, 2)))

      for _ <- 1..storm_count do
        Session.storm_random_particle(session_id)
      end
    end

    {:noreply, socket}
  end

  @impl true
  def handle_event("kill_all", _params, socket) do
    session_id = socket.assigns.session_id
    count = Session.count_particles(session_id)
    IO.puts("kill_all: session=#{session_id}, particle_count=#{count}")
    Session.kill_all_particles(session_id)
    {:noreply, socket}
  end

  @impl true
  def handle_event("toggle_theme", _params, socket) do
    new_theme = if socket.assigns.theme == :modern, do: :pirate, else: :modern

    socket =
      socket
      |> assign(:theme, new_theme)
      |> push_event("theme_changed", %{theme: new_theme})

    {:noreply, socket}
  end

  @impl true
  def handle_event("toggle_info", _params, socket) do
    {:noreply, assign(socket, :show_info, !socket.assigns.show_info)}
  end

  @impl true
  def handle_info(:chaos_tick, socket) do
    session_id = socket.assigns.session_id
    count = Session.count_particles(session_id)

    if socket.assigns.chaos_mode and count > 0 do
      # Randomly either storm or kill
      if :rand.uniform() > 0.5 do
        IO.puts("chaos: storm (#{count} particles)")
        Session.storm_random_particle(session_id)
      else
        IO.puts("chaos: kill (#{count} particles)")
        Session.kill_random_particle(session_id)
      end
    end

    {:noreply, socket}
  end

  @impl true
  def handle_info(:update_stats, socket) do
    stats = get_beam_stats(socket.assigns.session_id)
    socket = assign(socket, :stats, stats)
    socket = push_event(socket, "health_update", %{health: stats.health})
    {:noreply, socket}
  end

  @impl true
  def handle_info({:particle_spawned, data}, socket) do
    log = "[#{timestamp()}] SPAWN #{String.slice(data.id, 0..7)}"
    logs = Enum.take([log | socket.assigns.logs], @max_logs)

    socket =
      socket
      |> assign(:particle_count, Session.count_particles(socket.assigns.session_id))
      |> assign(:logs, logs)

    {:noreply, socket}
  end

  @impl true
  def handle_info({:particle_died, data}, socket) do
    reason = if data.reason == :crashed, do: "CRASH", else: "SINK"
    log = "[#{timestamp()}] #{reason} #{String.slice(to_string(data.id), 0..7)}"
    logs = Enum.take([log | socket.assigns.logs], @max_logs)

    socket =
      socket
      |> assign(:particle_count, Session.count_particles(socket.assigns.session_id))
      |> assign(:logs, logs)

    {:noreply, socket}
  end

  @impl true
  def handle_info({:particle_repairing, data}, socket) do
    log = "[#{timestamp()}] REPAIR #{String.slice(to_string(data.id), 0..7)}"
    logs = Enum.take([log | socket.assigns.logs], @max_logs)

    socket =
      socket
      |> assign(:particle_count, Session.count_particles(socket.assigns.session_id))
      |> assign(:restart_count, socket.assigns.restart_count + 1)
      |> assign(:logs, logs)

    {:noreply, socket}
  end

  @impl true
  def handle_info({:particle_stormed, data}, socket) do
    log = "[#{timestamp()}] STORM #{String.slice(to_string(data.id), 0..7)}"
    logs = Enum.take([log | socket.assigns.logs], @max_logs)
    {:noreply, assign(socket, :logs, logs)}
  end

  defp generate_session_id do
    :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
  end

  defp default_stats do
    %{
      process_count: 0,
      memory_mb: 0.0,
      uptime: "0s",
      health: 1.0
    }
  end

  defp timestamp do
    DateTime.utc_now()
    |> Calendar.strftime("%H:%M:%S")
  end

  defp get_beam_stats(session_id) do
    memory = :erlang.memory(:total)
    memory_mb = Float.round(memory / 1_000_000, 1)

    {uptime_ms, _} = :erlang.statistics(:wall_clock)
    uptime_s = div(uptime_ms, 1000)

    uptime =
      cond do
        uptime_s < 60 -> "#{uptime_s}s"
        uptime_s < 3600 -> "#{div(uptime_s, 60)}m #{rem(uptime_s, 60)}s"
        true -> "#{div(uptime_s, 3600)}h #{rem(div(uptime_s, 60), 60)}m"
      end

    # Calculate health based on this session's particle count
    process_count = :erlang.system_info(:process_count)
    particle_count = Session.count_particles(session_id)

    particle_stress = min(particle_count / @max_particles, 1.0)
    memory_stress = min(memory_mb / 200, 1.0)
    health = max(0.0, 1.0 - (particle_stress * 0.6 + memory_stress * 0.4))

    %{
      process_count: process_count,
      memory_mb: memory_mb,
      uptime: uptime,
      health: health
    }
  end

  defp health_color(health) when health > 0.7, do: "#00ff00"
  defp health_color(health) when health > 0.5, do: "#88ff00"
  defp health_color(health) when health > 0.3, do: "#ffaa00"
  defp health_color(_health), do: "#ff3300"
end
