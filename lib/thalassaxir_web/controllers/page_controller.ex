defmodule ThalassaxirWeb.PageController do
  use ThalassaxirWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
