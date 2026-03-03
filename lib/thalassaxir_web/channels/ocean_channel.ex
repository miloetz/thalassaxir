defmodule ThalassaxirWeb.OceanChannel do
  @moduledoc """
  Channel for real-time ocean particle updates.
  Each user gets their own private ocean session.
  """
  use ThalassaxirWeb, :channel

  alias Thalassaxir.Ocean.{Session, SessionSupervisor}
  alias Phoenix.PubSub

  @pubsub Thalassaxir.PubSub

  @impl true
  def join("ocean:lobby", payload, socket) do
    # Get or generate session ID
    session_id = Map.get(payload, "session_id") || generate_session_id()

    # Create or get the session
    case SessionSupervisor.get_or_create_session(session_id) do
      {:ok, ^session_id} ->
        # Subscribe to this session's events
        PubSub.subscribe(@pubsub, Session.pubsub_topic(session_id))

        socket = assign(socket, :session_id, session_id)

        # Send initial particle state
        particles = Session.get_all_particle_states(session_id)
        {:ok, %{particles: particles, session_id: session_id}, socket}

      {:error, reason} ->
        {:error, %{reason: reason}}
    end
  end

  # --- Incoming Events from Client ---

  @impl true
  def handle_in("spawn_particle", _payload, socket) do
    session_id = socket.assigns.session_id

    case Session.spawn_particle(session_id) do
      {:ok, _pid, id} -> {:reply, {:ok, %{id: id}}, socket}
      {:error, :max_particles_reached} -> {:reply, {:error, %{reason: "max_particles_reached"}}, socket}
      {:error, reason} -> {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  @impl true
  def handle_in("spawn_particles", %{"count" => count}, socket) do
    session_id = socket.assigns.session_id
    # Cap at 50 to prevent abuse
    count = min(count, 50)
    Session.spawn_particles(session_id, count)
    {:reply, {:ok, %{count: count}}, socket}
  end

  @impl true
  def handle_in("kill_particle", %{"id" => id}, socket) do
    session_id = socket.assigns.session_id
    Session.kill_particle(session_id, id)
    {:reply, :ok, socket}
  end

  @impl true
  def handle_in("kill_random", _payload, socket) do
    session_id = socket.assigns.session_id
    Session.kill_random_particle(session_id)
    {:reply, :ok, socket}
  end

  @impl true
  def handle_in("kill_all", _payload, socket) do
    session_id = socket.assigns.session_id
    Session.kill_all_particles(session_id)
    {:reply, :ok, socket}
  end

  @impl true
  def handle_in("get_state", _payload, socket) do
    session_id = socket.assigns.session_id
    particles = Session.get_all_particle_states(session_id)
    {:reply, {:ok, %{particles: particles}}, socket}
  end

  @impl true
  def handle_in("crash_particle", %{"id" => id}, socket) do
    session_id = socket.assigns.session_id
    Thalassaxir.Ocean.SessionParticle.crash(session_id, id)
    {:reply, :ok, socket}
  end

  @impl true
  def handle_in("storm_random", _payload, socket) do
    session_id = socket.assigns.session_id
    Session.storm_random_particle(session_id)
    {:reply, :ok, socket}
  end

  # --- PubSub Events ---

  @impl true
  def handle_info({:particle_spawned, data}, socket) do
    push(socket, "particle_spawned", data)
    {:noreply, socket}
  end

  @impl true
  def handle_info({:particle_died, data}, socket) do
    IO.puts("Channel received particle_died: #{data.id}, reason: #{data.reason}")
    push(socket, "particle_died", data)
    {:noreply, socket}
  end

  @impl true
  def handle_info({:particle_repairing, data}, socket) do
    push(socket, "particle_repairing", data)
    {:noreply, socket}
  end

  @impl true
  def handle_info({:particle_stormed, data}, socket) do
    push(socket, "particle_stormed", data)
    {:noreply, socket}
  end

  # --- Cleanup ---

  @impl true
  def terminate(_reason, socket) do
    # Clean up session when user disconnects
    if _session_id = socket.assigns[:session_id] do
      # Optionally stop the session entirely
      # For now, we let sessions persist for potential reconnection
      # SessionSupervisor.stop_session(session_id)
      :ok
    end
  end

  defp generate_session_id do
    :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
  end
end
